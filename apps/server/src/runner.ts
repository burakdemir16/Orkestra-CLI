import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, Run, RunEventType } from "../../../packages/shared/types";
import { interpolateArgs } from "./template";
import type { Store } from "./db";
import type { EventHub } from "./events";

const flowRoles = ["planner", "builder", "reviewer", "fixer"] as const;

export class Runner {
  constructor(
    private store: Store,
    private hub: EventHub
  ) {}

  start(run: Run) {
    void this.execute(run);
  }

  private emit(runId: string, type: RunEventType, message: string, agentId?: string | null, rawOutput?: string) {
    const event = this.store.addEvent({
      runId,
      agentId: agentId ?? null,
      type,
      message,
      rawOutput: rawOutput ?? null,
      createdAt: new Date().toISOString()
    });
    this.hub.publish(event);
  }

  private async execute(run: Run) {
    const transcript: string[] = [];
    this.store.updateRun(run.id, { status: "running", activeStep: "starting" });
    this.emit(run.id, "started", "Run started.");

    try {
      mkdirSync(run.workspacePath, { recursive: true });
      writeFileSync(join(run.workspacePath, "PROMPT.md"), run.prompt, "utf8");

      for (const role of flowRoles) {
        const agent = this.pickAgent(role);
        if (!agent) {
          this.emit(run.id, "failed", `No enabled agent for role: ${role}`);
          continue;
        }

        this.store.updateRun(run.id, { activeStep: `${role}: ${agent.name}` });
        const result = await this.runWithFallback(agent, run, transcript.join("\n\n"));
        transcript.push(`## ${result.agent.name} (${result.agent.role})\n${result.output}`);
      }

      writeFileSync(join(run.workspacePath, "TRANSCRIPT.md"), transcript.join("\n\n"), "utf8");
      this.store.updateRun(run.id, {
        status: "completed",
        activeStep: "completed",
        completedAt: new Date().toISOString(),
        summary: "Run completed. Transcript saved in workspace."
      });
      this.emit(run.id, "completed", "Run completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.updateRun(run.id, {
        status: "failed",
        activeStep: "failed",
        completedAt: new Date().toISOString(),
        summary: message
      });
      this.emit(run.id, "failed", message);
    }
  }

  private pickAgent(role: string) {
    return this.store
      .listAgents()
      .find((agent) => agent.enabled && agent.role === role && agent.status !== "limited");
  }

  private async runWithFallback(agent: Agent, run: Run, transcript: string): Promise<{ agent: Agent; output: string }> {
    try {
      return { agent, output: await this.runAgent(agent, run, transcript) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit(run.id, "failed", message, agent.id);
      for (const fallbackId of agent.fallbackAgentIds) {
        const fallback = this.store.getAgent(fallbackId);
        if (!fallback || !fallback.enabled || fallback.status === "limited") continue;
        this.emit(run.id, "fallback_used", `${agent.name} failed. Using ${fallback.name}.`, fallback.id);
        return { agent: fallback, output: await this.runAgent(fallback, run, transcript) };
      }
      throw error;
    }
  }

  private runAgent(agent: Agent, run: Run, transcript: string) {
    this.store.setAgentStatus(agent.id, "running");
    this.emit(run.id, "started", `${agent.name} started.`, agent.id);

    if (agent.command === "dry-run") {
      return this.runDryAgent(agent, run, transcript);
    }

    return new Promise<string>((resolve, reject) => {
      const args = interpolateArgs(agent.argsTemplate, {
        prompt: buildAgentPrompt(run.prompt, agent, transcript),
        workspace: run.workspacePath,
        transcript,
        role: agent.role
      });
      const child = spawnCommand(agent.command, args, {
        cwd: run.workspacePath,
        env: process.env
      });

      let output = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`${agent.name} timed out after ${agent.timeoutSeconds}s.`));
      }, agent.timeoutSeconds * 1000);

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        this.emit(run.id, "stdout", text, agent.id, text);
        this.checkLimit(agent, run.id, text);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        this.emit(run.id, "stderr", text, agent.id, text);
        this.checkLimit(agent, run.id, text);
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        this.store.setAgentStatus(agent.id, "available");
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        const current = this.store.getAgent(agent.id);
        if (current?.status !== "limited") this.store.setAgentStatus(agent.id, "available");

        if (code === 0) {
          this.emit(run.id, "completed", `${agent.name} completed.`, agent.id);
          resolve(output.trim() || "(no output)");
        } else {
          reject(new Error(`${agent.name} exited with code ${code}.`));
        }
      });
    });
  }

  private async runDryAgent(agent: Agent, run: Run, transcript: string) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const output = dryOutput(agent, run.prompt, transcript);
    this.emit(run.id, "stdout", output, agent.id, output);
    this.store.setAgentStatus(agent.id, "available");
    this.emit(run.id, "completed", `${agent.name} completed.`, agent.id);
    return output;
  }

  private checkLimit(agent: Agent, runId: string, text: string) {
    const lower = text.toLowerCase();
    const matched = agent.limitPatterns.find((pattern) => lower.includes(pattern.toLowerCase()));
    if (!matched) return;
    const now = new Date().toISOString();
    this.store.setAgentStatus(agent.id, "limited", now);
    this.emit(runId, "limit_detected", `${agent.name} limit detected: ${matched}`, agent.id, text);
  }
}

function spawnCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
) {
  if (process.platform !== "win32") {
    return spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });
  }

  const commandLine = [command, ...args].map(quoteWindowsShellArg).join(" ");
  return spawn(commandLine, {
    ...options,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function quoteWindowsShellArg(value: string) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function buildAgentPrompt(prompt: string, agent: Agent, transcript: string) {
  return [
    `User task:\n${prompt}`,
    "",
    `Your role: ${agent.role} / ${agent.name}`,
    "",
    "Previous agent transcript:",
    transcript || "No previous messages.",
    "",
    "Respond with concrete progress for your role. Keep output concise and actionable."
  ].join("\n");
}

function dryOutput(agent: Agent, prompt: string, transcript: string) {
  const prefix = transcript ? "I used the previous agent context. " : "";
  if (agent.role === "planner") {
    return `${prefix}Plan for "${prompt}": define audience, page structure, success criteria, and hand off to builder.`;
  }
  if (agent.role === "builder") {
    return `${prefix}Builder notes: create isolated workspace files, keep implementation small, and save transcript artifacts.`;
  }
  if (agent.role === "reviewer") {
    return `${prefix}Review notes: check UX clarity, responsive layout, failure handling, and whether the output matches the prompt.`;
  }
  return `${prefix}Fixer notes: apply reviewer feedback, rerun checks, and prepare changes for Git publish.`;
}

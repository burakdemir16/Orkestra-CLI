import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Agent, PlanTask, Run, RunEventType } from "../../../packages/shared/types";
import { interpolateArgs } from "./template";
import type { Store } from "./db";
import type { EventHub } from "./events";

const flowRoles = ["planner", "builder", "reviewer", "fixer"] as const;
const ignoredSnapshotDirs = new Set(["node_modules", ".git", "dist", ".next", ".cache", "__pycache__", ".turbo"]);
type FileSnapshot = Map<string, { size: number; mtimeMs: number; content?: string }>;
const maxDiffBytes = 512 * 1024;
const textExtensions = new Set([
  ".html", ".htm", ".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".sh", ".yml", ".yaml", ".xml", ".svg", ".vue", ".php"
]);

type RunControl = { notes: string[]; stop: boolean; child?: ReturnType<typeof spawnCommand> };

export class Runner {
  private controls = new Map<string, RunControl>();

  constructor(
    private store: Store,
    private hub: EventHub
  ) {}

  start(run: Run) {
    this.controls.set(run.id, { notes: [], stop: false });
    void this.execute(run);
  }

  // Ekip modu: alt-görevleri bağımlılığa göre çalıştırır (bağımsızlar paralel).
  startTeam(run: Run, tasks: PlanTask[]) {
    this.controls.set(run.id, { notes: [], stop: false });
    void this.executeTeam(run, tasks);
  }

  private async executeTeam(run: Run, tasks: PlanTask[]) {
    this.store.updateRun(run.id, { status: "running", activeStep: "team: planning" });
    this.emit(run.id, "started", `Ekip çalışması başladı (${tasks.length} görev).`);
    try {
      mkdirSync(run.workspacePath, { recursive: true });
      writeFileSync(join(run.workspacePath, "PROMPT.md"), run.prompt, "utf8");
      this.emit(run.id, "file_created", "PROMPT.md", null, JSON.stringify({ path: "PROMPT.md", adds: 0, dels: 0 }));

      const done = new Map<string, string>(); // taskId -> output
      const remaining = [...tasks];
      const control = this.controls.get(run.id);

      while (remaining.length) {
        if (control?.stop) {
          this.store.updateRun(run.id, { status: "failed", activeStep: "stopped", completedAt: new Date().toISOString(), summary: "Kullanıcı tarafından durduruldu." });
          this.emit(run.id, "failed", "Ekip çalışması kullanıcı tarafından durduruldu.");
          this.controls.delete(run.id);
          return;
        }
        // Bağımlılıkları tamamlanmış görevler bu turda paralel koşar.
        const ready = remaining.filter((t) => (t.dependsOn ?? []).every((d) => done.has(d)));
        if (!ready.length) {
          this.emit(run.id, "failed", "Çözülemeyen görev bağımlılığı (döngü?). Kalan görevler atlandı.");
          break;
        }
        this.store.updateRun(run.id, { activeStep: `team: ${ready.map((t) => t.id).join(", ")}` });
        const results = await Promise.all(ready.map((task) => this.runTeamTask(run, task, done)));
        results.forEach((res, i) => done.set(ready[i].id, res));
        for (const task of ready) {
          const index = remaining.findIndex((t) => t.id === task.id);
          if (index >= 0) remaining.splice(index, 1);
        }
      }

      const transcript = tasks.map((t) => `## ${t.title} (${t.id})\n${done.get(t.id) ?? "(çalışmadı)"}`).join("\n\n");
      writeFileSync(join(run.workspacePath, "TRANSCRIPT.md"), transcript, "utf8");
      this.emit(run.id, "file_created", "TRANSCRIPT.md", null, JSON.stringify({ path: "TRANSCRIPT.md", adds: 0, dels: 0 }));
      this.store.updateRun(run.id, { status: "completed", activeStep: "completed", completedAt: new Date().toISOString(), summary: "Ekip çalışması tamamlandı." });
      this.emit(run.id, "completed", "Ekip çalışması tamamlandı.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.updateRun(run.id, { status: "failed", activeStep: "failed", completedAt: new Date().toISOString(), summary: message });
      this.emit(run.id, "failed", message);
    } finally {
      this.controls.delete(run.id);
    }
  }

  private async runTeamTask(run: Run, task: PlanTask, done: Map<string, string>): Promise<string> {
    const role = task.role ?? "builder";
    // Birincil: belirli ajan ya da role uygun (limitli değilse onu seç). Limitli ajan
    // tek seçenekse yine de zincir başı yap ki yedeğine devredilebilsin.
    const primary =
      (task.agentId ? this.store.getAgent(task.agentId) : this.pickAgent(role)) ??
      this.store.listAgents().find((a) => a.enabled && a.role === role);
    if (!primary || !primary.enabled) {
      this.emit(run.id, "failed", `Göreve ajan atanamadı: ${task.title}`);
      return "(ajan yok)";
    }
    const folder = (task.folder ?? "").replace(/[^a-z0-9._/-]/gi, "");
    const cwd = folder ? join(run.workspacePath, folder) : run.workspacePath;
    const depContext = (task.dependsOn ?? [])
      .map((d) => done.get(d))
      .filter(Boolean)
      .join("\n\n");
    const promptText = [
      "Sen bir EKİP çalışmasında bir alt-görevi üstlendin.",
      `Görevin: ${task.title}`,
      folder ? `Bu görev için çalışma klasörü: ${folder} (dosyalarını buraya yaz).` : "",
      depContext ? `\nBağımlı olduğun önceki görevlerin çıktısı:\n${depContext}` : "",
      "",
      "Projenin genel amacı:",
      run.prompt,
      "",
      "Görevini somut olarak tamamla; gerekli dosyaları oluştur/düzenle. Çıktını kısa tut."
    ].filter(Boolean).join("\n");

    // Faz 5: birincil ajan + yedek zinciri. Limit/hata olursa yedeğe devret.
    // Dosyalar workspace'te kaldığı için yeni ajan kaldığı yerden devam eder.
    const chain = this.buildAgentChain(primary);
    let lastError = "";
    for (let i = 0; i < chain.length; i++) {
      const agent = chain[i];
      // Güncel durum: bu ajan bu sırada limite takıldıysa atla.
      if (this.store.getAgent(agent.id)?.status === "limited") {
        this.emit(run.id, "limit_detected", `${agent.name} limitli, atlanıyor.`, agent.id);
        continue;
      }
      if (i > 0) {
        this.emit(run.id, "fallback_used", `${chain[0].name} başarısız/limitli → ${agent.name} devraldı.`, agent.id);
      }
      this.emit(run.id, "agent_step", `${agent.name} → ${task.title}`, agent.id);
      try {
        return await this.runAgent(agent, run, "", [], { cwd, promptText });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.emit(run.id, "failed", `${task.title} (${agent.name}): ${lastError}`, agent.id);
        // sonraki yedeğe geç
      }
    }
    return `(tüm ajanlar başarısız: ${lastError})`;
  }

  // Bir ajan + (enabled) yedeklerinden oluşan aday zinciri.
  private buildAgentChain(primary: Agent): Agent[] {
    const chain: Agent[] = [primary];
    const seen = new Set([primary.id]);
    for (const fallbackId of primary.fallbackAgentIds) {
      if (seen.has(fallbackId)) continue;
      const fallback = this.store.getAgent(fallbackId);
      if (fallback && fallback.enabled) {
        chain.push(fallback);
        seen.add(fallbackId);
      }
    }
    return chain;
  }

  // Kullanıcının çalışan run'a bıraktığı not — sıradaki ajanın prompt'una eklenir.
  addNote(runId: string, note: string): boolean {
    const control = this.controls.get(runId);
    if (!control) return false;
    control.notes.push(note);
    this.emit(runId, "agent_step", `Kullanıcı notu kuyruğa alındı: ${note}`, null);
    return true;
  }

  // Çalışan run'ı durdurur: o anki süreci öldürür, run'ı failed işaretler.
  stop(runId: string): boolean {
    const control = this.controls.get(runId);
    if (!control) return false;
    control.stop = true;
    try {
      control.child?.kill();
    } catch {
      // süreç zaten bitmiş olabilir
    }
    this.emit(runId, "agent_step", "Kullanıcı durdurma istedi.", null);
    return true;
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
      this.emit(run.id, "file_created", "PROMPT.md", null, "PROMPT.md");

      const control = this.controls.get(run.id);
      for (const role of flowRoles) {
        if (control?.stop) {
          this.store.updateRun(run.id, { status: "failed", activeStep: "stopped", completedAt: new Date().toISOString(), summary: "Kullanıcı tarafından durduruldu." });
          this.emit(run.id, "failed", "Çalışma kullanıcı tarafından durduruldu.");
          this.controls.delete(run.id);
          return;
        }

        const agent = this.pickAgent(role);
        if (!agent) {
          this.emit(run.id, "failed", `No enabled agent for role: ${role}`);
          continue;
        }

        // Adımlar arası: kullanıcının bıraktığı notları topla, bu ajana ilet.
        const notes = control ? control.notes.splice(0) : [];

        this.store.updateRun(run.id, { activeStep: `${role}: ${agent.name}` });
        this.emit(run.id, "agent_step", `${agent.name} handling ${role}.`, agent.id);
        const result = await this.runWithFallback(agent, run, transcript.join("\n\n"), notes);
        transcript.push(`## ${result.agent.name} (${result.agent.role})\n${result.output}`);
      }
      this.controls.delete(run.id);

      writeFileSync(join(run.workspacePath, "TRANSCRIPT.md"), transcript.join("\n\n"), "utf8");
      this.emit(run.id, "file_created", "TRANSCRIPT.md", null, "TRANSCRIPT.md");
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
    } finally {
      this.controls.delete(run.id);
    }
  }

  private pickAgent(role: string) {
    return this.store
      .listAgents()
      .find((agent) => agent.enabled && agent.role === role && agent.status !== "limited");
  }

  private async runWithFallback(agent: Agent, run: Run, transcript: string, notes: string[] = []): Promise<{ agent: Agent; output: string }> {
    try {
      return { agent, output: await this.runAgent(agent, run, transcript, notes) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit(run.id, "failed", message, agent.id);
      for (const fallbackId of agent.fallbackAgentIds) {
        const fallback = this.store.getAgent(fallbackId);
        if (!fallback || !fallback.enabled || fallback.status === "limited") continue;
        this.emit(run.id, "fallback_used", `${agent.name} failed. Using ${fallback.name}.`, fallback.id);
        return { agent: fallback, output: await this.runAgent(fallback, run, transcript, notes) };
      }
      throw error;
    }
  }

  private runAgent(agent: Agent, run: Run, transcript: string, notes: string[] = [], opts?: { cwd?: string; promptText?: string }) {
    const cwd = opts?.cwd ?? run.workspacePath;
    this.store.setAgentStatus(agent.id, "running");
    this.emit(run.id, "started", `${agent.name} started.`, agent.id);

    if (agent.command === "dry-run") {
      return this.runDryAgent(agent, run, transcript);
    }

    const cleanEnv = { ...process.env };
    if (agent.command === "claude") {
      for (const key of Object.keys(cleanEnv)) {
        const normalized = key.toUpperCase();
        if (normalized.startsWith("ANTHROPIC_") || normalized.startsWith("CLAUDE_CODE_")) {
          delete cleanEnv[key];
        }
      }
    }
    // CLI'lar (özellikle agy) sistem PATH'inde olmayabilir; kendi bin dizinlerini ekle.
    if (process.platform === "win32") {
      const home = process.env.USERPROFILE ?? "";
      const agyBin = join(home, "AppData", "Local", "agy", "bin");
      const npmDir = join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "npm");
      cleanEnv.PATH = [agyBin, npmDir, cleanEnv.PATH ?? cleanEnv.Path].filter(Boolean).join(";");
    }

    return new Promise<string>((resolve, reject) => {
      mkdirSync(cwd, { recursive: true });
      let lastSnapshot = snapshotWorkspace(cwd);
      const reportFileChanges = () => {
        const nextSnapshot = snapshotWorkspace(cwd);
        for (const change of diffSnapshots(lastSnapshot, nextSnapshot)) {
          this.emit(
            run.id,
            change.type,
            change.path,
            agent.id,
            JSON.stringify({ path: change.path, adds: change.adds, dels: change.dels })
          );
        }
        lastSnapshot = nextSnapshot;
      };
      const fileWatch = setInterval(reportFileChanges, 1000);
      const promptText = opts?.promptText ?? buildAgentPrompt(run.prompt, agent, transcript, notes);
      // Prompt'u argüman yerine stdin'den ver: Windows cmd.exe çok satırlı argümanı keser.
      // {prompt} placeholder'ı args'tan çıkarılır; metin stdin'e yazılır.
      const templateArgs = agent.argsTemplate.filter((arg) => arg.trim() !== "{prompt}");
      const args = interpolateArgs(templateArgs, {
        prompt: promptText,
        workspace: cwd,
        transcript,
        role: agent.role
      });
      const child = spawnCommand(agent.command, args, {
        cwd,
        env: cleanEnv
      });
      try {
        child.stdin?.end(promptText);
      } catch {
        // stdin yazılamazsa süreç zaten başlamamış olabilir
      }
      const control = this.controls.get(run.id);
      if (control) control.child = child;

      let output = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`${agent.name} timed out after ${agent.timeoutSeconds}s.`));
      }, agent.timeoutSeconds * 1000);

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        this.emit(run.id, "stdout", text, agent.id, text);
        reportFileChanges();
        this.checkLimit(agent, run.id, text);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        this.emit(run.id, "stderr", text, agent.id, text);
        reportFileChanges();
        this.checkLimit(agent, run.id, text);
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        clearInterval(fileWatch);
        this.store.setAgentStatus(agent.id, "available");
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        clearInterval(fileWatch);
        reportFileChanges();
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
      stdio: ["pipe", "pipe", "pipe"]
    });
  }

  const commandLine = [command, ...args].map(quoteWindowsShellArg).join(" ");
  return spawn(commandLine, {
    ...options,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function quoteWindowsShellArg(value: string) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function buildAgentPrompt(prompt: string, agent: Agent, transcript: string, notes: string[] = []) {
  const noteBlock = notes.length
    ? `\n\nKULLANICI ARA TALİMATLARI (mutlaka dikkate al):\n${notes.map((n) => `- ${n}`).join("\n")}`
    : "";
  return [
    `User task:\n${prompt}${noteBlock}`,
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

function snapshotWorkspace(root: string): FileSnapshot {
  const snapshot: FileSnapshot = new Map();
  if (!existsSync(root)) return snapshot;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ignoredSnapshotDirs.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = statSync(fullPath);
      const ext = fullPath.slice(fullPath.lastIndexOf(".")).toLowerCase();
      let content: string | undefined;
      if (textExtensions.has(ext) && stat.size <= maxDiffBytes) {
        try {
          content = readFileSync(fullPath, "utf8");
        } catch {
          content = undefined;
        }
      }
      snapshot.set(relative(root, fullPath).replace(/\\/g, "/"), {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        content
      });
    }
  };

  walk(root);
  return snapshot;
}

function diffSnapshots(before: FileSnapshot, after: FileSnapshot) {
  const changes: Array<{ type: "file_created" | "file_changed" | "file_deleted"; path: string; adds: number; dels: number }> = [];
  for (const [path, current] of after) {
    const previous = before.get(path);
    if (!previous) {
      changes.push({ type: "file_created", path, ...lineDiff(undefined, current.content) });
    } else if (previous.size !== current.size || previous.mtimeMs !== current.mtimeMs) {
      changes.push({ type: "file_changed", path, ...lineDiff(previous.content, current.content) });
    }
  }
  for (const [path, previous] of before) {
    if (!after.has(path)) changes.push({ type: "file_deleted", path, ...lineDiff(previous.content, undefined) });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

// Satır bazlı kaba diff (multiset). Sıra değişimlerini tam yakalamaz ama
// eklenen/silinen satır sayısı için yeterince iyi bir +/- verir.
function lineDiff(oldText?: string, newText?: string): { adds: number; dels: number } {
  if (oldText === undefined && newText === undefined) return { adds: 0, dels: 0 };
  const oldLines = oldText !== undefined ? oldText.split("\n") : [];
  const newLines = newText !== undefined ? newText.split("\n") : [];
  const freq = new Map<string, number>();
  for (const line of oldLines) freq.set(line, (freq.get(line) ?? 0) + 1);
  let adds = 0;
  for (const line of newLines) {
    const count = freq.get(line) ?? 0;
    if (count > 0) freq.set(line, count - 1);
    else adds++;
  }
  let dels = 0;
  for (const remaining of freq.values()) dels += Math.max(0, remaining);
  return { adds, dels };
}

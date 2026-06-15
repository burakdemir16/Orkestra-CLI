import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "./config";
import { Store, defaultLimitPatterns } from "./db";
import { EventHub } from "./events";
import { Runner } from "./runner";
import { GitService } from "./git";
import {
  detectPipelineIntent,
  generateBrief,
  getCliStatuses,
  logoutCli,
  runDebate,
  runPlannerChat,
  startLoginCli,
  testCli
} from "./cli";
import type { Agent, ChatMessage, ChatRequest, CreateRunRequest, EffortLevel, SaveAgentRequest } from "../../../packages/shared/types";

const config = getConfig();
const store = new Store(config);
const hub = new EventHub();
const runner = new Runner(store, hub);
const git = new GitService(process.cwd());

const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });
const uploadsDir = join(config.dataDir, "uploads");
mkdirSync(uploadsDir, { recursive: true });
await app.register(cors, { origin: true });

app.get("/api/health", async () => ({ ok: true }));

// Chat'e eklenen gorseli diske yazar; donen yol prompt'a konup CLI'lar tarafindan okunur.
app.post<{ Body: { name?: string; dataUrl?: string } }>("/api/upload", async (request, reply) => {
  const dataUrl = request.body.dataUrl ?? "";
  const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
  if (!match) return reply.code(400).send({ error: "Geçersiz dosya verisi." });
  const mime = match[1];
  if (!mime.startsWith("image/")) return reply.code(400).send({ error: "Yalnızca görsel yüklenebilir." });
  const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 8);
  const safeName = (request.body.name ?? "image").replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]/gi, "_").slice(0, 40) || "image";
  const path = join(uploadsDir, `${randomUUID().slice(0, 8)}-${safeName}.${ext}`);
  writeFileSync(path, Buffer.from(match[2], "base64"));
  return { path, name: safeName };
});

app.post<{ Body: ChatRequest }>("/api/chat", async (request, reply) => {
  const message = request.body.message?.trim();
  if (!message) return reply.code(400).send({ error: "Message is required" });

  const attachments = (request.body.attachments ?? []).filter((path) => typeof path === "string" && path.trim());
  const augmentedMessage = attachments.length
    ? `${message}\n\n[Ekli görsel dosyaları — bunları oku ve yanıtında dikkate al:\n${attachments.join("\n")}]`
    : message;
  const result = await runPlannerChat(request.body.planner ?? "auto", augmentedMessage, request.body.history ?? [], request.body.model, request.body.effort, request.body.detailLevel);
  const action = detectPipelineIntent(message) ? "suggest_pipeline" : "none";
  const createdAt = new Date().toISOString();
  const messages = result.messages?.map((item) => ({
    ...item,
    id: randomUUID(),
    createdAt
  }));

  return {
    message: {
      id: randomUUID(),
      role: "assistant",
      content: result.output,
      planner: result.planner,
      modelLabel: result.modelLabel,
      createdAt
    },
    messages,
    action,
    suggestedPrompt: action === "suggest_pipeline" ? message : undefined,
    planner: result.planner,
    modelLabel: result.modelLabel,
    usedFallback: result.usedFallback,
    error: result.error
  };
});

// Kurul/Tartisma modu: ajanlar sirayla tartisir; her olay (mesaj/ozet) NDJSON
// satiri olarak akar ki UI tartismayi canli izlesin.
app.post<{
  Body: {
    message?: string;
    history?: ChatMessage[];
    participants?: Array<"claude" | "codex" | "antigravity">;
    rounds?: number;
    model?: string;
    effort?: EffortLevel;
    detailLevel?: "low" | "medium" | "high";
  };
}>("/api/debate", async (request, reply) => {
  const message = request.body.message?.trim();
  if (!message) return reply.code(400).send({ error: "Message is required" });

  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  try {
    for await (const event of runDebate(
      request.body.participants ?? [],
      message,
      request.body.history ?? [],
      request.body.rounds ?? 1,
      request.body.model,
      request.body.effort,
      request.body.detailLevel
    )) {
      reply.raw.write(`${JSON.stringify(event)}\n`);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    reply.raw.write(`${JSON.stringify({ type: "error", modelLabel: "Sistem", message: messageText })}\n`);
  }
  reply.raw.end();
});

// Sohbetten Code Task Brief uretir (Chat -> Code gecisi). Kullanici duzenleyip onaylar.
app.post<{ Body: { history?: ChatMessage[]; message?: string; planner?: "claude" | "codex" | "antigravity" | "auto" } }>(
  "/api/brief",
  async (request) => {
    return generateBrief(request.body.history ?? [], request.body.message, request.body.planner ?? "auto");
  }
);

app.get("/api/cli-status", async () => ({
  tools: await getCliStatuses(),
  checkedAt: new Date().toISOString()
}));

app.post<{ Params: { agent: "claude" | "codex" | "antigravity" } }>("/api/cli/:agent/login", async (request) => {
  return startLoginCli(request.params.agent);
});

app.post<{ Params: { agent: "claude" | "codex" | "antigravity" } }>("/api/cli/:agent/logout", async (request) => {
  return logoutCli(request.params.agent);
});

app.post<{ Params: { agent: "claude" | "codex" | "antigravity" } }>("/api/cli/:agent/test", async (request) => {
  return testCli(request.params.agent);
});

app.get("/api/agents", async () => store.listAgents());

app.post<{ Body: SaveAgentRequest }>("/api/agents", async (request) => {
  const agent: Agent = {
    id: slug(`${request.body.role}-${request.body.name}`),
    status: "available",
    lastLimitedAt: null,
    ...normalizeAgentInput(request.body)
  };
  store.saveAgent(agent);
  return agent;
});

app.put<{ Params: { id: string }; Body: SaveAgentRequest }>("/api/agents/:id", async (request, reply) => {
  const existing = store.getAgent(request.params.id);
  if (!existing) return reply.code(404).send({ error: "Agent not found" });

  const agent: Agent = {
    ...existing,
    ...normalizeAgentInput(request.body),
    id: request.params.id
  };
  store.saveAgent(agent);
  return agent;
});

app.delete<{ Params: { id: string } }>("/api/agents/:id", async (request) => {
  store.deleteAgent(request.params.id);
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/agents/:id/activate", async (request, reply) => {
  const agent = store.getAgent(request.params.id);
  if (!agent) return reply.code(404).send({ error: "Agent not found" });

  const allAgents = store.listAgents();
  for (const a of allAgents) {
    if (a.role === agent.role) {
      const updated: Agent = {
        ...a,
        enabled: a.id === agent.id,
        status: a.id === agent.id ? ("available" as const) : a.status
      };
      store.saveAgent(updated);
    }
  }
  return { ok: true };
});

app.post("/api/agents/reset", async () => {
  const defaults = ["codex-planner", "claude-builder", "gemini-reviewer", "codex-fixer"];
  const allAgents = store.listAgents();
  for (const a of allAgents) {
    const updated: Agent = {
      ...a,
      enabled: defaults.includes(a.id),
      status: "available" as const
    };
    store.saveAgent(updated);
  }
  return { ok: true };
});

app.get("/api/runs", async () => store.listRuns());

app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
  const run = store.getRun(request.params.id);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  return {
    ...run,
    events: store.listEvents(run.id)
  };
});

app.post<{ Body: CreateRunRequest }>("/api/runs", async (request, reply) => {
  if (!request.body.prompt?.trim()) {
    return reply.code(400).send({ error: "Prompt is required" });
  }

  const id = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8);
  const run = {
    id,
    prompt: request.body.prompt.trim(),
    status: "queued" as const,
    workspacePath: join(config.workspaceDir, `run-${id}`),
    createdAt: new Date().toISOString(),
    completedAt: null,
    activeStep: "queued",
    summary: null
  };
  store.createRun(run);
  const event = store.addEvent({
    runId: run.id,
    agentId: null,
    type: "queued",
    message: "Run queued.",
    rawOutput: null,
    createdAt: new Date().toISOString()
  });
  hub.publish(event);
  runner.start(run);
  return reply.code(201).send(run);
});

app.get<{ Params: { id: string } }>("/api/runs/:id/events", async (request, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  for (const event of store.listEvents(request.params.id)) {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  hub.subscribe(request.params.id, reply);
});

app.get("/api/git/status", async () => git.status());

app.post<{ Body: { branch: string } }>("/api/git/branch", async (request) => {
  await git.createBranch(request.body.branch);
  return { ok: true };
});

app.post<{ Body: { files: string[]; message: string } }>("/api/git/commit", async (request) => {
  await git.commit(request.body.files, request.body.message);
  return { ok: true };
});

app.post<{ Body: { branch: string } }>("/api/git/push", async (request) => {
  await git.push(request.body.branch);
  return { ok: true };
});

app.post<{ Body: { title: string; body: string } }>("/api/git/pr", async (request) => {
  const output = await git.createDraftPr(request.body.title, request.body.body);
  return { ok: true, output };
});

await app.listen({ host: config.host, port: config.port });

function normalizeAgentInput(input: SaveAgentRequest) {
  return {
    name: input.name.trim(),
    role: input.role,
    command: input.command.trim(),
    argsTemplate: input.argsTemplate.filter((arg) => arg.trim().length > 0),
    enabled: input.enabled,
    timeoutSeconds: Math.max(10, Number(input.timeoutSeconds || 120)),
    fallbackAgentIds: input.fallbackAgentIds,
    limitPatterns: input.limitPatterns.length ? input.limitPatterns : defaultLimitPatterns()
  };
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || randomUUID();
}

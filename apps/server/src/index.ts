import Fastify from "fastify";
import cors from "@fastify/cors";
import * as pty from "node-pty";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, extname, normalize } from "node:path";
import { getConfig } from "./config";
import { Store, defaultLimitPatterns } from "./db";
import { EventHub } from "./events";
import { Runner } from "./runner";
import { GitService } from "./git";
import {
  analyzeDebate,
  detectPipelineIntent,
  generateBrief,
  generatePlan,
  getCliStatuses,
  logoutCli,
  runDebate,
  runPlannerChat,
  startLoginCli,
  testCli
} from "./cli";
import type { Agent, ChatMessage, ChatParticipant, ChatRequest, CreateRunRequest, EffortLevel, SaveAgentRequest } from "../../../packages/shared/types";

const config = getConfig();
const store = new Store(config);
const hub = new EventHub();
const runner = new Runner(store, hub);
const git = new GitService(process.cwd());

const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });
const uploadsDir = join(config.dataDir, "uploads");
mkdirSync(uploadsDir, { recursive: true });
await app.register(cors, { origin: true });

type TerminalShell = "powershell" | "cmd";
type TerminalSession = {
  id: string;
  shell: TerminalShell;
  name: string;
  cwd: string;
  buffer: string;
  process: pty.IPty;
  createdAt: string;
  updatedAt: string;
};

const terminalSessions = new Map<string, TerminalSession>();
const maxTerminalBuffer = 240_000;

app.get("/api/health", async () => ({ ok: true }));

// Eki tanımlar: görselse yolu ver (CLI okur), metin/kod dosyasıysa içeriğini prompt'a göm.
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico"]);
function describeAttachment(path: string): string {
  const name = path.split(/[\\/]/).pop() || path;
  const ext = extname(path).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return `Görsel: ${path}`;
  try {
    const content = readFileSync(path, "utf8").slice(0, 24000);
    const lang = ext.replace(/^\./, "") || "";
    return `Dosya \`${name}\` (${path}):\n\`\`\`${lang}\n${content}\n\`\`\``;
  } catch {
    return `Dosya: ${path}`;
  }
}

// Chat'e eklenen gorseli diske yazar; donen yol prompt'a konup CLI'lar tarafindan okunur.
app.post<{ Body: { name?: string; dataUrl?: string } }>("/api/upload", async (request, reply) => {
  const dataUrl = request.body.dataUrl ?? "";
  const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
  if (!match) return reply.code(400).send({ error: "Geçersiz dosya verisi." });
  const mime = match[1];
  const isImage = mime.startsWith("image/");
  // Orijinal dosya adını + uzantısını koru (txt, md, kod vb. de kabul).
  const rawName = request.body.name ?? (isImage ? "image" : "file");
  const safeName = rawName.replace(/[^a-z0-9._-]/gi, "_").slice(0, 60) || "file";
  const hasExt = /\.[^.]+$/.test(safeName);
  const fallbackExt = isImage ? (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 8) : "txt";
  const finalName = hasExt ? safeName : `${safeName}.${fallbackExt}`;
  const path = join(uploadsDir, `${randomUUID().slice(0, 8)}-${finalName}`);
  writeFileSync(path, Buffer.from(match[2], "base64"));
  return { path, name: finalName, isImage };
});

app.post<{ Body: ChatRequest }>("/api/chat", async (request, reply) => {
  const message = request.body.message?.trim();
  if (!message) return reply.code(400).send({ error: "Message is required" });

  const attachments = (request.body.attachments ?? []).filter((path) => typeof path === "string" && path.trim());
  const augmentedMessage = attachments.length
    ? `${message}\n\n[Ekli dosyalar — incele ve yanıtında dikkate al:\n${attachments.map((p) => describeAttachment(p)).join("\n\n")}]`
    : message;
  const result = await runPlannerChat(request.body.planner ?? "auto", augmentedMessage, request.body.history ?? [], request.body.model, request.body.effort, request.body.detailLevel, request.body.participants);
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
    participants?: Array<ChatParticipant | "claude" | "codex" | "antigravity">;
    rounds?: number;
    model?: string;
    effort?: EffortLevel;
    detailLevel?: "low" | "medium" | "high";
    skipClosing?: boolean;
  };
}>("/api/debate", async (request, reply) => {
  const message = request.body.message?.trim();
  if (!message) return reply.code(400).send({ error: "Message is required" });

  // Hem yeni {cli, model} hem eski string formatını kabul et.
  const participants = (request.body.participants ?? []).map((p) =>
    typeof p === "string" ? { cli: p } : { cli: p.cli, model: p.model }
  );

  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  try {
    for await (const event of runDebate(
      participants,
      message,
      request.body.history ?? [],
      request.body.rounds ?? 1,
      request.body.model,
      request.body.effort,
      request.body.detailLevel,
      request.body.skipClosing
    )) {
      reply.raw.write(`${JSON.stringify(event)}\n`);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    reply.raw.write(`${JSON.stringify({ type: "error", modelLabel: "Sistem", message: messageText })}\n`);
  }
  reply.raw.end();
});

// Operatör analizi (tartışma sonrası, STREAM'den bağımsız normal POST → JSON).
// Code modunda tartışma bitince frontend bunu çağırır; her zaman geçerli kart döner.
app.post<{
  Body: {
    message?: string;
    turns?: Array<{ cli?: string; modelLabel?: string; content?: string }>;
    participants?: Array<ChatParticipant | "claude" | "codex" | "antigravity">;
    operator?: ChatParticipant;
    model?: string;
    effort?: EffortLevel;
  };
}>("/api/analyze", async (request, reply) => {
  const message = request.body.message?.trim();
  const rawTurns = request.body.turns ?? [];
  if (!message || !rawTurns.length) return reply.code(400).send({ error: "message and turns are required" });

  const turns = rawTurns
    .filter((t) => t.content?.trim())
    .map((t) => ({ planner: (t.cli ?? "claude") as any, modelLabel: t.modelLabel ?? t.cli ?? "Ajan", content: t.content!.trim() }));
  if (!turns.length) return reply.code(400).send({ error: "no valid turns" });

  const participants = (request.body.participants ?? []).map((p) =>
    typeof p === "string" ? { cli: p } : { cli: p.cli, model: p.model }
  );
  const op = request.body.operator?.cli
    ? { cli: request.body.operator.cli, model: request.body.operator.model }
    : participants[0];
  if (!op) return reply.code(400).send({ error: "no operator/participant" });

  const result = await analyzeDebate(participants as any, op as any, message, turns, request.body.model, request.body.effort);
  return result;
});

// Sohbetten Code Task Brief uretir (Chat -> Code gecisi). Kullanici duzenleyip onaylar.
app.post<{ Body: { history?: ChatMessage[]; message?: string; planner?: "claude" | "codex" | "antigravity" | "auto" } }>(
  "/api/brief",
  async (request) => {
    return generateBrief(request.body.history ?? [], request.body.message, request.body.planner ?? "auto");
  }
);

// Plancı projeyi alt-görevlere böler + FAZLARA ayırır (operatör analizini dikkate alarak).
// Fazları icra eden ajan belirler: operatör/ekip lideri (planner+model). Kullanıcı düzenleyip onaylar.
app.post<{ Body: { history?: ChatMessage[]; message?: string; planner?: "claude" | "codex" | "antigravity" | "auto"; analysis?: string; model?: string } }>(
  "/api/plan",
  async (request) => {
    return generatePlan(
      request.body.history ?? [],
      request.body.message,
      request.body.planner ?? "auto",
      request.body.analysis,
      request.body.model
    );
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

  // Sürekli proje: workspacePath verilmişse aynı projede devam et (güvenlik için
  // mutlaka workspaceDir altında olmalı). Yoksa yeni bir run klasörü oluştur.
  const workspaceRoot = resolve(config.workspaceDir);
  let workspacePath = join(config.workspaceDir, `run-${id}`);
  const requested = request.body.workspacePath?.trim();
  if (requested) {
    const resolved = resolve(requested);
    if (resolved === workspaceRoot || resolved.startsWith(`${workspaceRoot}/`) || resolved.startsWith(`${workspaceRoot}\\`)) {
      workspacePath = resolved;
    }
  }

  const run = {
    id,
    prompt: request.body.prompt.trim(),
    status: "queued" as const,
    workspacePath,
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
  // Görev planı verilmişse ekip modu; yoksa doğrusal pipeline.
  if (request.body.tasks?.length) {
    runner.startTeam(run, request.body.tasks);
  } else {
    runner.start(run);
  }
  return reply.code(201).send(run);
});

// Çalışan run'a ara talimat (steering notu) bırak — sıradaki ajan dikkate alır.
app.post<{ Params: { id: string }; Body: { note?: string } }>("/api/runs/:id/note", async (request, reply) => {
  const note = request.body.note?.trim();
  if (!note) return reply.code(400).send({ error: "Note is required" });
  const ok = runner.addNote(request.params.id, note);
  if (!ok) return reply.code(409).send({ error: "Run is not active." });
  return { ok: true };
});

// Çalışan run'ı durdur.
app.post<{ Params: { id: string } }>("/api/runs/:id/stop", async (request, reply) => {
  const ok = runner.stop(request.params.id);
  if (!ok) return reply.code(409).send({ error: "Run is not active." });
  return { ok: true };
});

// Faz onayı: kullanıcı "devam et" deyince bir sonraki faza geçer.
app.post<{ Params: { id: string } }>("/api/runs/:id/resume", async (request, reply) => {
  const ok = runner.resumeRun(request.params.id);
  if (!ok) return reply.code(409).send({ error: "Run is not awaiting a phase confirmation." });
  return { ok: true };
});

// Yeni proje klasörü oluşturur (workspaceDir altında, isimden türetilmiş benzersiz ad).
app.post<{ Body: { name?: string } }>("/api/projects/create", async (request, reply) => {
  const name = (request.body.name ?? "").trim();
  const base = slug(name) || `proje-${randomUUID().slice(0, 6)}`;
  let dir = join(config.workspaceDir, base);
  let i = 2;
  while (existsSync(dir)) dir = join(config.workspaceDir, `${base}-${i++}`);
  mkdirSync(dir, { recursive: true });
  return { workspacePath: resolve(dir), name: name || base };
});

// Proje klasörünü yeniden adlandırır (gerçek dizini taşır). Yeni mutlak yolu döndürür.
app.post<{ Body: { path?: string; newName?: string } }>("/api/projects/rename", async (request, reply) => {
  const current = request.body.path?.trim();
  const newName = (request.body.newName ?? "").trim();
  if (!current || !newName) return reply.code(400).send({ error: "path and newName are required" });
  const workspaceRoot = resolve(config.workspaceDir);
  const resolved = resolve(current);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}/`) && !resolved.startsWith(`${workspaceRoot}\\`)) {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (!existsSync(resolved)) return reply.code(404).send({ error: "Folder not found" });
  const base = slug(newName) || `proje-${randomUUID().slice(0, 6)}`;
  let target = join(config.workspaceDir, base);
  let i = 2;
  while (existsSync(target) && resolve(target) !== resolved) target = join(config.workspaceDir, `${base}-${i++}`);
  try {
    if (resolve(target) !== resolved) renameSync(resolved, target);
    return { workspacePath: resolve(target), name: newName };
  } catch (error) {
    return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Çalışma klasörünü işletim sisteminin dosya yöneticisinde açar (Windows Explorer vb.).
app.post<{ Body: { path?: string } }>("/api/open-folder", async (request, reply) => {
  const requested = request.body.path?.trim();
  if (!requested) return reply.code(400).send({ error: "Path is required" });
  const workspaceRoot = resolve(config.workspaceDir);
  const resolved = resolve(requested);
  // Güvenlik: yalnızca workspace altındaki klasörler açılabilir.
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}/`) && !resolved.startsWith(`${workspaceRoot}\\`)) {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (!existsSync(resolved)) return reply.code(404).send({ error: "Folder not found" });
  try {
    if (process.platform === "win32") {
      spawn("explorer.exe", [resolved], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [resolved], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [resolved], { detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true };
  } catch (error) {
    return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
  }
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

// ----- File Explorer API -----
const ignoredDirs = new Set(["node_modules", ".git", "dist", ".next", ".cache", "__pycache__", ".turbo"]);
const allowedRoots = [resolve(process.cwd()), resolve(config.workspaceDir)];

function isPathAllowed(target: string) {
  const resolved = resolve(target);
  return allowedRoots.some((root) => resolved.startsWith(root));
}

app.get<{ Querystring: { path?: string } }>("/api/files", async (request, reply) => {
  const target = resolve(request.query.path || process.cwd());
  if (!isPathAllowed(target)) return reply.code(403).send({ error: "Forbidden" });
  if (!existsSync(target)) return reply.code(404).send({ error: "Not found" });

  try {
    const entries = readdirSync(target, { withFileTypes: true })
      .filter((e) => !ignoredDirs.has(e.name) && !e.name.startsWith("."))
      .map((e) => {
        const fullPath = join(target, e.name);
        const isDir = e.isDirectory();
        try {
          const stat = statSync(fullPath);
          return { name: e.name, path: fullPath, type: isDir ? "dir" : "file" as const, size: isDir ? undefined : stat.size };
        } catch {
          return { name: e.name, path: fullPath, type: isDir ? "dir" : "file" as const };
        }
      })
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "dir" ? -1 : 1;
      });
    return { path: target, entries };
  } catch (error) {
    return reply.code(500).send({ error: error instanceof Error ? error.message : "Read error" });
  }
});

// ----- Integrated Terminal API -----
app.get("/api/terminals", async () => ({
  sessions: Array.from(terminalSessions.values()).map((session) => terminalInfo(session))
}));

app.post<{ Body: { shell?: TerminalShell; cwd?: string } }>("/api/terminals", async (request, reply) => {
  const shell = request.body.shell === "cmd" ? "cmd" : "powershell";
  const cwd = resolve(request.body.cwd || process.cwd());
  if (!isPathAllowed(cwd)) return reply.code(403).send({ error: "Forbidden cwd" });
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return reply.code(400).send({ error: "Invalid cwd" });

  const executable = shell === "cmd" ? "cmd.exe" : "powershell.exe";
  const args = shell === "cmd" ? [] : ["-NoLogo"];
  const id = randomUUID();
  const proc = pty.spawn(executable, args, {
    name: "xterm-color",
    cols: 100,
    rows: 28,
    cwd,
    env: process.env
  });

  const session: TerminalSession = {
    id,
    shell,
    name: shell === "cmd" ? "cmd" : "PowerShell",
    cwd,
    buffer: "",
    process: proc,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  proc.onData((data) => {
    session.buffer += stripAnsi(data);
    if (session.buffer.length > maxTerminalBuffer) {
      session.buffer = session.buffer.slice(session.buffer.length - maxTerminalBuffer);
    }
    session.updatedAt = new Date().toISOString();
  });
  proc.onExit(() => {
    session.updatedAt = new Date().toISOString();
  });
  terminalSessions.set(id, session);
  return reply.code(201).send(terminalInfo(session));
});

app.get<{ Params: { id: string }; Querystring: { offset?: string } }>("/api/terminals/:id/output", async (request, reply) => {
  const session = terminalSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: "Terminal not found" });
  const offset = Math.max(0, Number(request.query.offset || 0));
  return {
    id: session.id,
    output: session.buffer.slice(offset),
    cursor: session.buffer.length,
    updatedAt: session.updatedAt
  };
});

app.post<{ Params: { id: string }; Body: { data?: string } }>("/api/terminals/:id/input", async (request, reply) => {
  const session = terminalSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: "Terminal not found" });
  session.process.write(request.body.data ?? "");
  session.updatedAt = new Date().toISOString();
  return { ok: true };
});

app.post<{ Params: { id: string }; Body: { cols?: number; rows?: number } }>("/api/terminals/:id/resize", async (request, reply) => {
  const session = terminalSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: "Terminal not found" });
  session.process.resize(
    Math.max(40, Math.min(240, Number(request.body.cols || 100))),
    Math.max(10, Math.min(80, Number(request.body.rows || 28)))
  );
  return { ok: true };
});

app.delete<{ Params: { id: string } }>("/api/terminals/:id", async (request, reply) => {
  const session = terminalSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: "Terminal not found" });
  session.process.kill();
  terminalSessions.delete(request.params.id);
  return { ok: true };
});

app.get<{ Querystring: { path: string } }>("/api/files/read", async (request, reply) => {
  const target = resolve(request.query.path || "");
  if (!isPathAllowed(target)) return reply.code(403).send({ error: "Forbidden" });
  if (!existsSync(target)) return reply.code(404).send({ error: "Not found" });
  try {
    const stat = statSync(target);
    if (stat.isDirectory()) return reply.code(400).send({ error: "Is a directory" });
    if (stat.size > 512 * 1024) return reply.code(413).send({ error: "File too large (max 512KB)" });
    const content = readFileSync(target, "utf8");
    return { path: target, content, size: stat.size };
  } catch (error) {
    return reply.code(500).send({ error: error instanceof Error ? error.message : "Read error" });
  }
});

// ----- Workspace Preview (serves run workspace files for iframe preview) -----
const mimeTypes: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".webp": "image/webp", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf"
};

// Çalışma alanındaki giriş HTML dosyasını bulur (alt klasörlerde olabilir).
function findEntryHtml(root: string): string | null {
  const queue: string[] = [""];
  let firstHtml: string | null = null;
  while (queue.length) {
    const rel = queue.shift()!;
    const dir = join(root, rel);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        queue.push(childRel);
      } else if (entry.name.toLowerCase() === "index.html") {
        return childRel; // index.html en yüksek öncelik
      } else if (entry.name.toLowerCase().endsWith(".html") && !firstHtml) {
        firstHtml = childRel;
      }
    }
  }
  return firstHtml;
}

// Önizleme giriş noktasını döndürür: { entry: "relatif/yol" } ya da 404.
app.get<{ Params: { runId: string } }>("/preview-entry/:runId", async (request, reply) => {
  const run = store.getRun(request.params.runId);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  if (!existsSync(run.workspacePath)) return reply.code(404).send({ error: "Workspace not found" });
  const entry = findEntryHtml(run.workspacePath);
  if (!entry) return reply.code(404).send({ error: "No HTML entry" });
  return reply.send({ entry });
});

app.get<{ Params: { runId: string; "*": string } }>("/preview/:runId/*", async (request, reply) => {
  const run = store.getRun(request.params.runId);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  const filePath = normalize(join(run.workspacePath, request.params["*"] || "index.html"));
  if (!filePath.startsWith(normalize(run.workspacePath))) return reply.code(403).send({ error: "Forbidden" });
  if (!existsSync(filePath)) return reply.code(404).send({ error: "File not found" });
  const ext = extname(filePath).toLowerCase();
  const mime = mimeTypes[ext] || "application/octet-stream";
  const content = readFileSync(filePath);
  return reply.type(mime).send(content);
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

function terminalInfo(session: TerminalSession) {
  return {
    id: session.id,
    shell: session.shell,
    name: session.name,
    cwd: session.cwd,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function stripAnsi(value: string) {
  return value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, "")
    .replace(/\x1B[()][A-Za-z0-9]/g, "")
    .replace(/\x1B[=>]/g, "");
}

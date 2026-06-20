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
import { PreviewManager, detectProjectType } from "./preview";
import {
  analyzeDebate,
  detectPipelineIntent,
  generateBrief,
  generatePlan,
  clearLoginOverride,
  getCliStatuses,
  installCli,
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
const previews = new PreviewManager();

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
  rawBuffer: string; // ANSI'li ham çıktı (xterm gömülü terminal için)
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
  const result = await runPlannerChat(request.body.planner ?? "auto", augmentedMessage, request.body.history ?? [], request.body.model, request.body.effort, request.body.detailLevel, request.body.participants, request.body.cache);
  const action = detectPipelineIntent(message) ? "suggest_pipeline" : "none";
  const createdAt = new Date().toISOString();
  const resultMessages = (result as { messages?: ChatMessage[] }).messages;
  const messages = resultMessages?.map((item) => ({
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
    error: result.error,
    // Artımlı bağlam özeti — istemci bunu cache'leyip sonraki istekte geri gönderir.
    contextSummary: (result as { contextSummary?: string }).contextSummary,
    summaryUpto: (result as { summaryUpto?: number }).summaryUpto
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
app.post<{ Body: { history?: ChatMessage[]; message?: string; planner?: "claude" | "codex" | "antigravity" | "auto"; analysis?: string; model?: string; agentCount?: number } }>(
  "/api/plan",
  async (request) => {
    return generatePlan(
      request.body.history ?? [],
      request.body.message,
      request.body.planner ?? "auto",
      request.body.analysis,
      request.body.model,
      request.body.agentCount
    );
  }
);

app.get("/api/cli-status", async () => ({
  tools: await getCliStatuses(),
  checkedAt: new Date().toISOString()
}));

// CLI bin dizinlerini PATH'e ekleyen pty env'i (agy/npm sistem PATH'inde olmayabilir).
function cliPtyEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE ?? "";
    const agyBin = join(home, "AppData", "Local", "agy", "bin");
    const npmDir = join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "npm");
    env.PATH = [agyBin, npmDir, env.PATH ?? env.Path].filter(Boolean).join(";");
  }
  return env;
}

// Komutu YAKALANAN bir pty'de (gerçek pseudo-konsol) çalıştırır; çıktısı buffer'a yazılır.
// agy'nin "irm | iex" kurulum scripti headless stdout'a yazamıyordu; pty bunu çözer.
function spawnCapturedPty(name: string, command: string, rows = 30): string {
  const id = randomUUID();
  const proc = pty.spawn("powershell.exe", ["-NoLogo", "-Command", command], {
    name: "xterm-color", cols: 120, rows, cwd: process.cwd(), env: cliPtyEnv()
  });
  const session: TerminalSession = {
    id, shell: "powershell", name, cwd: process.cwd(),
    buffer: "", rawBuffer: "", process: proc, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  proc.onData((data) => {
    session.buffer += stripAnsi(data);
    if (session.buffer.length > maxTerminalBuffer) session.buffer = session.buffer.slice(session.buffer.length - maxTerminalBuffer);
    session.rawBuffer += data;
    if (session.rawBuffer.length > maxTerminalBuffer) session.rawBuffer = session.rawBuffer.slice(session.rawBuffer.length - maxTerminalBuffer);
    session.updatedAt = new Date().toISOString();
  });
  proc.onExit(() => { session.updatedAt = new Date().toISOString(); });
  terminalSessions.set(id, session);
  return id;
}

app.post<{ Params: { agent: "claude" | "codex" | "antigravity" } }>("/api/cli/:agent/install", async (request) => {
  const agent = request.params.agent;
  const cmd =
    agent === "claude" ? "npm install -g @anthropic-ai/claude-code"
    : agent === "codex" ? "npm install -g @openai/codex"
    : "irm https://antigravity.google/cli/install.ps1 | iex"; // agy
  // Non-blocking: pty'de başlat, hemen dön. Frontend durumu yoklayıp "kuruldu"yu yakalar.
  const id = spawnCapturedPty(`${agent} install`, cmd);
  return { ok: true, terminalId: id, message: `${agent} kurulumu başladı (tamamlanınca otomatik algılanır).` };
});

app.post<{ Params: { agent: "claude" | "codex" | "antigravity" } }>("/api/cli/:agent/login", async (request) => {
  const agent = request.params.agent;
  const loginCmd = agent === "claude" ? "claude auth login" : agent === "codex" ? "codex login" : "agy login";
  // Login pty'sini UZUN spawn et: agy onboarding'i [Previous]/[Done] butonlarını ancak yeterli
  // satır olunca render ediyor; kısa pty'de butonlar çizilmiyor ve navigasyon takılıyordu.
  const id = spawnCapturedPty(`${agent} login`, loginCmd, agent === "antigravity" ? 48 : 30);
  // Not: Onboarding'i kullanıcı klavyeyle yapar (odak renkle gösterildiği için güvenilir
  // oto-tespit yok). Arayüz her adımda ne yapılacağını tarif eder.
  return { ok: true, terminalId: id, message: `${agent} login başlatıldı (giriş tamamlanınca otomatik algılanır).` };
});

// Login penceresinin PID dosyası + başlangıç bilgisi (otomatik kapatma için).
let loginWinPidFile = "";
let loginWinStart = 0;
let loginWinLogSize = 0; // login başlarkenki cli.log boyutu — YENİ satırları ayırt etmek için

function agyCliLogPath() {
  return join(process.env.USERPROFILE ?? "", ".gemini", "antigravity-cli", "cli.log");
}

// agy login TAM bitti mi? REPL'e gelince cli.log'a "Auth done received / silent auth succeeded /
// Experiments refreshed after login" yazılır. Login başlangıcından SONRA eklenen log kısmında
// bu işaret çıkarsa tamamlanmıştır (eski/önceki login satırlarına takılmaz).
function agyLoginCompleted(): boolean {
  try {
    if (!loginWinStart) return false; // aktif login yok
    const file = agyCliLogPath();
    if (!existsSync(file)) return false;
    const log = readFileSync(file, "utf8");
    const fresh = log.length >= loginWinLogSize ? log.slice(loginWinLogSize) : log; // truncate olduysa hepsi
    return /Auth done received|silent auth succeeded|Experiments refreshed after login|OAuth:\s+authenticated successfully/i.test(fresh);
  } catch {
    return false;
  }
}

// GÖRÜNÜR gerçek terminal penceresi açar ve login'i orada başlatır (native, %100 çalışır).
// Kullanıcı onboarding + tarayıcı + kod yapıştırmayı bu pencerede yapar; dialog görsel rehber sunar.
app.post<{ Params: { agent: "claude" | "codex" | "antigravity" } }>("/api/cli/:agent/login-window", async (request) => {
  const agent = request.params.agent;
  clearLoginOverride(agent); // önceki "Çıkış" bastırmasını kaldır → giriş algılanabilsin
  const loginCmd = agent === "claude" ? "claude auth login" : agent === "codex" ? "codex login" : "agy login";
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE ?? "";
    const agyBin = join(home, "AppData", "Local", "agy", "bin");
    const npmDir = join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "npm");
    // Pencere powershell'inin PID'sini dosyaya yaz (sonradan otomatik kapatmak için).
    loginWinPidFile = join(process.env.TEMP ?? home, `orkestra-${agent}-login.pid`);
    loginWinStart = Date.now();
    // Login başlarkenki cli.log boyutu (YENI auth-done satırını bundan sonra ararız).
    loginWinLogSize = existsSync(agyCliLogPath()) ? statSync(agyCliLogPath()).size : 0;
    const psCmd =
      `Set-Content -LiteralPath '${loginWinPidFile}' -Value $PID -Encoding ascii; ` +
      `$env:PATH='${agyBin};${npmDir};' + $env:PATH; ${loginCmd}`;
    spawn("cmd.exe", ["/d", "/c", "start", `${agent} login`, "powershell.exe", "-NoProfile", "-Command", psCmd], {
      detached: true, stdio: "ignore", windowsHide: false
    }).unref();
  } else {
    spawn("sh", ["-lc", loginCmd], { detached: true, stdio: "ignore" }).unref();
  }
  return { ok: true, message: `${agent} login penceresi açıldı.` };
});

// Login penceresindeki süreç TAMAMLANDI mı? (agy: trust folder yazıldı mı)
app.get<{ Params: { agent: string } }>("/api/cli/:agent/login-window/poll", async (request) => {
  if (request.params.agent === "antigravity") return { done: agyLoginCompleted() };
  return { done: false };
});

// Login penceresini (powershell + agy ağacı) öldür → pencere kapanır.
app.post("/api/cli/:agent/login-window/close", async () => {
  try {
    if (loginWinPidFile && existsSync(loginWinPidFile)) {
      const pid = readFileSync(loginWinPidFile, "utf8").trim();
      if (/^\d+$/.test(pid)) {
        spawn("taskkill", ["/PID", pid, "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      }
    }
  } catch {
    // yok say
  }
  return { ok: true };
});

// agy login onboarding'ini ODAK İŞARETİNİ izleyerek otomatik geçer:
//  - "Choose your color scheme" → Enter (varsayılan şema)
//  - "Terms of Service" → "> Done" odakta olana dek aşağı in, sonra Enter (varsayılan onay kutusu zaten [x])
//  - device-code/oauth URL'i çıkınca bırak (kullanıcı tarayıcı+kodu devralır)
function autoDriveAgyOnboarding(terminalId: string) {
  const session = terminalSessions.get(terminalId);
  if (!session) return;
  let acc = "";
  let phase: "color" | "tos" | "done" = "color";
  let last = 0;
  let tosTries = 0;
  const write = (d: string) => { try { session.process.write(d); } catch { /* yok say */ } };
  const driver = session.process.onData((chunk) => {
    acc = (acc + stripAnsi(chunk)).slice(-3000);
    if (/Paste this code|accounts\.google\.com\/o\/oauth2|oauth2\/auth\?/i.test(acc)) {
      try { driver.dispose(); } catch { /* yok say */ }
      return;
    }
    const now = Date.now();
    if (now - last < 450) return; // debounce
    if (phase === "color" && /Choose your color scheme/i.test(acc)) {
      last = now; phase = "tos"; acc = "";
      setTimeout(() => write("\r"), 500); // varsayılan şemayı seç
      return;
    }
    if (phase === "tos" && /Terms of Service|I agree to help improve/i.test(acc)) {
      // Sadece SON kareyi incele (odak işareti "> Done" yalnız Done seçiliyken çıkar;
      // seçili değilken "[Done]" görünür). Onay kutusuna asla Space/Enter göndermeyiz.
      const frame = acc.slice(acc.lastIndexOf("Data Use"));
      if (/>\s*Done/.test(frame)) {
        last = now; phase = "done";
        setTimeout(() => write("\r"), 250); // Done odakta → onayla (varsayılan [x] korunur)
      } else if (tosTries < 8) {
        last = now; tosTries++;
        write("\x1b[B"); // aşağı: onay kutusu → Previous → Done (↑/↓ Navigate)
      }
    }
  });
  // Güvenlik: 90sn sonra sürücüyü bırak.
  setTimeout(() => { try { driver.dispose(); } catch { /* yok say */ } }, 90_000);
}

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
  let workspacePath = join(config.workspaceDir, `run-${id}`);
  const requested = request.body.workspacePath?.trim();
  if (requested) {
    const resolved = resolve(requested);
    // workspaceDir altında VEYA kullanıcının açtığı dış proje kökü → o klasörde devam et.
    if (underWorkspaceOrOpened(resolved)) {
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
  // Diff paneli için baz: workspace'i git deposu yapıp run ÖNCESİ durumu commit'le.
  // Böylece sonradan working-tree diff yalnızca bu run'ın değişikliklerini gösterir.
  try {
    mkdirSync(workspacePath, { recursive: true });
    await new GitService(workspacePath).commitBaseline();
  } catch (err) {
    app.log.warn(`git baseline failed: ${err instanceof Error ? err.message : String(err)}`);
  }
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

// Çalışan run'ı durdur. Canlı kontrol varsa süreçleri öldürür; YOKSA (ör. sunucu yeniden
// başlamış, kontrol kaybolmuş) yine de run'ı store'da durdurulmuş işaretler ve event yayar →
// UI her durumda durur (sessizce takılı kalmaz).
app.post<{ Params: { id: string } }>("/api/runs/:id/stop", async (request, reply) => {
  const id = request.params.id;
  const killed = runner.stop(id);
  const run = store.getRun(id);
  if (run && run.status !== "completed" && run.status !== "failed") {
    store.updateRun(id, { status: "failed", activeStep: "stopped", completedAt: new Date().toISOString(), summary: "Durduruldu." });
    const ev = store.addEvent({ runId: id, agentId: null, type: "failed", message: "🛑 Durduruldu.", rawOutput: null, createdAt: new Date().toISOString() });
    hub.publish(ev);
  }
  return { ok: true, killed };
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

// Mevcut bir klasörü proje olarak aç: native klasör seçme dialog'u açar, seçilen yolu
// "açılan kök" olarak kaydeder (dosya/run/aç izinleri ona da verilir) ve döndürür.
app.post("/api/projects/open", async (_request, reply) => {
  if (process.platform !== "win32") {
    return reply.code(400).send({ error: "Klasör seçici şu an yalnızca Windows'ta destekleniyor." });
  }
  // Modern Explorer-stili klasör seçici: IFileOpenDialog (FOS_PICKFOLDERS) — eski ağaç dialog'u değil.
  // C# COM arayüzü Add-Type ile derlenir. Escape sorunu olmasın diye script'i temp .ps1'e yazıp -File ile çalıştırırız.
  const ps1 = `$ErrorActionPreference = 'SilentlyContinue'
$code = @'
using System;
using System.Runtime.InteropServices;
public static class ModernFolderPicker {
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // Arka-plan süreçte foreground hakkı al: ALT bas-bırak hilesi + SetForegroundWindow.
  public static void ForceForeground(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero); // ALT down
    keybd_event(0x12, 0, 2, UIntPtr.Zero); // ALT up
    SetForegroundWindow(h);
  }
  public static string Show(IntPtr owner) {
    IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();
    uint opts; dlg.GetOptions(out opts);
    dlg.SetOptions(opts | 0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
    dlg.SetTitle("Orkestra: proje klasoru sec");
    int hr = dlg.Show(owner);
    if (hr != 0) return "";
    IShellItem item; dlg.GetResult(out item);
    string path; item.GetDisplayName(0x80058000u, out path); // SIGDN_FILESYSPATH
    return path;
  }
  [ComImport, ClassInterface(ClassInterfaceType.None), Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW { }
  [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint a, IntPtr b);
    void SetFileTypeIndex(uint a);
    void GetFileTypeIndex(out uint a);
    void Advise(IntPtr a, out uint b);
    void Unadvise(uint a);
    void SetOptions(uint fos);
    void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem a);
    void SetFolder(IShellItem a);
    void GetFolder(out IShellItem a);
    void GetCurrentSelection(out IShellItem a);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string a);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string a);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string a);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string a);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr a, ref Guid b, ref Guid c, out IntPtr d);
    void GetParent(out IShellItem a);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(uint a, out uint b);
    void Compare(IShellItem a, uint b, out int c);
  }
}
'@
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition $code -Language CSharp
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1,1)
$owner.Opacity = 0
$owner.Show()
[System.Windows.Forms.Application]::DoEvents()
[ModernFolderPicker]::ForceForeground($owner.Handle)
$p = [ModernFolderPicker]::Show($owner.Handle)
$owner.Close()
if ($p) { [Console]::Out.Write($p) }
`;
  const scriptFile = join(config.dataDir, "pick-folder.ps1");
  try { writeFileSync(scriptFile, ps1, "utf8"); } catch { /* yoksay */ }
  const { out: selected, err } = await new Promise<{ out: string; err: string }>((res) => {
    const ps = spawn("powershell", ["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", scriptFile], { windowsHide: true });
    let out = "";
    let errBuf = "";
    ps.stdout?.on("data", (d) => (out += d.toString()));
    ps.stderr?.on("data", (d) => (errBuf += d.toString()));
    ps.on("close", () => res({ out: out.trim(), err: errBuf.trim() }));
    ps.on("error", (e) => res({ out: "", err: e.message }));
  });
  if (err) app.log.warn(`projects/open dialog: ${err}`);
  if (!selected) return reply.send({ cancelled: true });
  const resolved = resolve(selected);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return reply.code(400).send({ error: "Geçerli bir klasör seçilmedi." });
  }
  openedRoots.add(resolved);
  saveOpenedRoots();
  const name = resolved.split(/[\\/]/).filter(Boolean).pop() || "proje";
  return reply.send({ workspacePath: resolved, name });
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
  // Aktif (çalışan/kuyruktaki) bir run'ın cwd'si olan klasör Windows'ta kilitlidir →
  // fiziksel renameSync EPERM verir. Bu durumda klasörü taşımadan YALNIZCA görünen adı
  // güncelle (klasör adı aynı kalır; kullanıcı çalışma sürerken de yeniden adlandırabilir).
  const activeInFolder = store.listRuns().some((r) => {
    if (r.status !== "running" && r.status !== "queued") return false;
    const ws = resolve(r.workspacePath);
    return ws === resolved || ws.startsWith(`${resolved}\\`) || ws.startsWith(`${resolved}/`);
  });
  if (activeInFolder) {
    return { workspacePath: resolved, name: newName };
  }
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
  const resolved = resolve(requested);
  // Güvenlik: workspace altındaki VEYA kullanıcının açtığı dış proje klasörleri.
  if (!underWorkspaceOrOpened(resolved)) {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (!existsSync(resolved)) return reply.code(404).send({ error: "Folder not found" });
  try {
    if (process.platform === "win32") {
      // 1) Açmayı GARANTİ et: explorer.exe doğrudan (eski güvenilir yol).
      spawn("explorer.exe", [resolved], { detached: true, stdio: "ignore" }).unref();
      // 2) Öne-alma AYRI bir PS süreci: açılan Explorer penceresini yola göre bulup
      //    ALT-tuşu hilesiyle foreground'a çeker. Bu süreç hata verse bile (Add-Type vb.)
      //    klasör adım 1'de zaten açılmıştır.
      const escaped = resolved.replace(/'/g, "''");
      const ps1 = `$ErrorActionPreference = 'SilentlyContinue'
$target = '${escaped}'
try {
$code = @'
using System;
using System.Runtime.InteropServices;
public static class Fg {
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll", SetLastError = true)] private static extern bool SystemParametersInfo(uint act, uint p, IntPtr v, uint ini);
  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
  public static void Bring(IntPtr h) {
    // Windows foreground-lock'u geçici devre dışı bırak → SetForegroundWindow saygı görür.
    SystemParametersInfo(0x2001, 0, IntPtr.Zero, 0); // SPI_SETFOREGROUNDLOCKTIMEOUT = 0
    ShowWindow(h, 9); // SW_RESTORE
    // Hedef pencerenin input thread'ine bağlan → foreground hakkını paylaş.
    uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint mine = GetCurrentThreadId();
    AttachThreadInput(fgThread, mine, true);
    keybd_event(0x12, 0, 0, UIntPtr.Zero); // ALT down
    keybd_event(0x12, 0, 2, UIntPtr.Zero); // ALT up
    BringWindowToTop(h);
    SetForegroundWindow(h);
    AttachThreadInput(fgThread, mine, false);
  }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
Start-Sleep -Milliseconds 900
$norm = $target.TrimEnd('\')
$shell = New-Object -ComObject Shell.Application
foreach ($w in $shell.Windows()) {
  try {
    $p = $w.Document.Folder.Self.Path
    if ($p -and ($p.TrimEnd('\') -ieq $norm)) { [Fg]::Bring([IntPtr]$w.HWND); break }
  } catch {}
}
} catch {}
`;
      const scriptFile = join(config.dataDir, "open-folder.ps1");
      try {
        writeFileSync(scriptFile, ps1, "utf8");
        spawn("powershell", ["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", scriptFile], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      } catch { /* öne-alma opsiyonel; klasör zaten açıldı */ }
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

// Dosyayı (veya klasörü) VS Code'da açar. `code` CLI PATH'te olmalı.
app.post<{ Body: { path?: string } }>("/api/open-in-vscode", async (request, reply) => {
  const requested = request.body.path?.trim();
  if (!requested) return reply.code(400).send({ error: "Path is required" });
  const resolved = resolve(requested);
  // Güvenlik: workspace altındaki VEYA kullanıcının açtığı dış proje yolları.
  if (!underWorkspaceOrOpened(resolved)) {
    return reply.code(403).send({ error: "Forbidden" });
  }
  if (!existsSync(resolved)) return reply.code(404).send({ error: "Path not found" });
  try {
    // Windows'ta `code` aslında `code.cmd` → shell:true ile bulunur.
    const child = spawn("code", ["--reuse-window", resolved], {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32"
    });
    child.on("error", (err) => {
      app.log.warn(`open-in-vscode failed: ${err.message}`);
    });
    child.unref();
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

// Bir run workspace'inin çalışma-ağacı diff'i (dosya başına unified diff + adds/dels).
app.get<{ Params: { runId: string } }>("/api/git/diff/:runId", async (request, reply) => {
  const run = store.getRun(request.params.runId);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  if (!existsSync(run.workspacePath)) return reply.code(404).send({ error: "Workspace not found" });
  const files = await new GitService(run.workspacePath).workingDiff();
  return { files };
});

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
// Kullanıcının "Mevcut klasör aç" ile açtığı dış proje kökleri (workspace dışındaki gerçek projeler).
// Diske kalıcı: server yeniden başlayınca izinler korunur.
const openedRoots = new Set<string>();
const openedRootsFile = join(config.dataDir, "opened-roots.json");
function loadOpenedRoots() {
  try {
    const arr = JSON.parse(readFileSync(openedRootsFile, "utf8"));
    if (Array.isArray(arr)) for (const p of arr) if (typeof p === "string") openedRoots.add(resolve(p));
  } catch { /* yoksa boş başla */ }
}
function saveOpenedRoots() {
  try { writeFileSync(openedRootsFile, JSON.stringify([...openedRoots]), "utf8"); } catch { /* yoksay */ }
}
loadOpenedRoots();

function isPathAllowed(target: string) {
  const resolved = resolve(target);
  return allowedRoots.some((root) => resolved.startsWith(root)) || [...openedRoots].some((root) => resolved.startsWith(root));
}

// workspaceDir VEYA açılan dış köklerden biri altında mı? (run/dosya/aç izinleri için)
function underWorkspaceOrOpened(resolved: string): boolean {
  const roots = [resolve(config.workspaceDir), ...openedRoots];
  return roots.some((root) => resolved === root || resolved.startsWith(`${root}/`) || resolved.startsWith(`${root}\\`));
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
    rawBuffer: "",
    process: proc,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  proc.onData((data) => {
    session.buffer += stripAnsi(data);
    if (session.buffer.length > maxTerminalBuffer) {
      session.buffer = session.buffer.slice(session.buffer.length - maxTerminalBuffer);
    }
    session.rawBuffer += data;
    if (session.rawBuffer.length > maxTerminalBuffer) {
      session.rawBuffer = session.rawBuffer.slice(session.rawBuffer.length - maxTerminalBuffer);
    }
    session.updatedAt = new Date().toISOString();
  });
  proc.onExit(() => {
    session.updatedAt = new Date().toISOString();
  });
  terminalSessions.set(id, session);
  return reply.code(201).send(terminalInfo(session));
});

app.get<{ Params: { id: string }; Querystring: { offset?: string; raw?: string } }>("/api/terminals/:id/output", async (request, reply) => {
  const session = terminalSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ error: "Terminal not found" });
  const offset = Math.max(0, Number(request.query.offset || 0));
  // raw=1 → ANSI'li ham çıktı (xterm gömülü terminal için). Aksi halde temiz metin.
  const source = request.query.raw === "1" ? session.rawBuffer : session.buffer;
  return {
    id: session.id,
    output: source.slice(offset),
    cursor: source.length,
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

// Proje tipini + (statikse) giriş HTML'ini döndürür. Önizleme butonu bununla görünür.
app.get<{ Params: { runId: string } }>("/api/preview/info/:runId", async (request, reply) => {
  const run = store.getRun(request.params.runId);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  if (!existsSync(run.workspacePath)) return reply.send({ type: "none" });
  const entry = findEntryHtml(run.workspacePath);
  const type = detectProjectType(run.workspacePath, Boolean(entry));
  return reply.send({ type, entry: type === "static" ? entry : undefined });
});

// Önizlemeyi başlatır: vite ise dev sunucusunu ayağa kaldırır, statikse iframe yolunu döndürür.
app.post<{ Params: { runId: string } }>("/api/preview/start/:runId", async (request, reply) => {
  const run = store.getRun(request.params.runId);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  if (!existsSync(run.workspacePath)) return reply.code(404).send({ error: "Workspace not found" });
  const entry = findEntryHtml(run.workspacePath);
  const type = detectProjectType(run.workspacePath, Boolean(entry));
  if (type === "vite") return reply.send(previews.start(run.id, run.workspacePath));
  if (type === "static") return reply.send({ type: "static", entry });
  return reply.code(404).send({ error: "No preview available" });
});

// Vite dev sunucusunun durumunu sorgular (installing → starting → ready).
app.get<{ Params: { runId: string } }>("/api/preview/status/:runId", async (request, reply) => {
  const state = previews.get(request.params.runId);
  if (!state) return reply.code(404).send({ error: "Not started" });
  return reply.send(state);
});

// Vite dev sunucusunu durdurur.
app.post<{ Params: { runId: string } }>("/api/preview/stop/:runId", async (request) => {
  previews.stop(request.params.runId);
  return { ok: true };
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

// Sunucu kapanırken vite dev süreçlerini de kapat.
for (const sig of ["SIGINT", "SIGTERM", "exit"] as const) {
  process.on(sig, () => previews.stopAll());
}

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

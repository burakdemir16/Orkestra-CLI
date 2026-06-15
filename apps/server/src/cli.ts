import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ChatMessage, CliToolStatus, EffortLevel } from "../../../packages/shared/types";
import { getModelOptions, getUsageFor } from "./usage";

const exec = promisify(execFile);
const plannerTimeoutMs = 60_000;
const claudeTimeoutMs = 60_000;
const statusTimeoutMs = 6_000;
const loggedOutOverrides = new Set<PlannerId>();

export type PlannerId = "claude" | "codex" | "antigravity";
export type PlannerSelection = PlannerId | "auto" | "all";

export async function runPlannerChat(
  preferred: PlannerSelection,
  message: string,
  history: ChatMessage[],
  model?: string,
  effort?: EffortLevel,
  detailLevel?: "low" | "medium" | "high"
) {
  if (preferred === "all") {
    const statuses = await getCliStatuses();
    const planners = statuses
      .filter((status) => status.authenticated && status.quotaOk)
      .map((status) => status.id);
    if (!planners.length) {
      return {
        planner: "local",
        modelLabel: "Sistem",
        output: "Doğrulanmış CLI yok. Önce kullanmak istediğiniz ajan için giriş yapın.",
        usedFallback: true,
        error: "Doğrulanmış CLI yok."
      };
    }
    const results = await Promise.all(planners.map((planner) => runSinglePlanner(planner, message, history, model, effort, detailLevel)));
    const allFailed = results.every((result) => result.usedFallback);
    return {
      planner: "all",
      modelLabel: "Tüm CLI'lar",
      output: results.map((result) => `## ${result.modelLabel}\n${result.output}`).join("\n\n"),
      messages: results.map((result) => ({
        role: "assistant" as const,
        content: result.output,
        planner: result.planner,
        modelLabel: result.modelLabel
      })),
      usedFallback: allFailed,
      error: allFailed ? results.map((result) => result.error).filter(Boolean).join("\n") : undefined
    };
  }

  const order = preferred === "auto" ? (["codex", "claude", "antigravity"] as PlannerId[]) : [preferred];
  const errors: string[] = [];

  for (const planner of order) {
    try {
      await assertPlannerReady(planner);
      const output = await callPlanner(planner, message, history, model, effort, detailLevel);
      return {
        planner,
        modelLabel: modelLabel(planner),
        output: cleanPlannerOutput(output),
        usedFallback: planner !== preferred && preferred !== "auto"
      };
    } catch (error) {
      const rawOutput = error instanceof Error ? error.message : String(error);
      const output = cleanPlannerOutput(rawOutput);
      if (output !== rawOutput && !output.includes("thread.started")) {
        return {
          planner,
          modelLabel: modelLabel(planner),
          output,
          usedFallback: planner !== preferred && preferred !== "auto"
        };
      }
      errors.push(`${label(planner)}: ${plannerErrorOutput(planner, output)}`);
    }
  }

  return {
    planner: "local",
    modelLabel: "Yerel fallback",
    output: localPlannerReply(message),
    usedFallback: true,
    error: errors.join("\n")
  };
}

async function runSinglePlanner(planner: PlannerId, message: string, history: ChatMessage[], model?: string, effort?: EffortLevel, detailLevel?: "low" | "medium" | "high") {
  try {
    await assertPlannerReady(planner);
    const output = cleanPlannerOutput(await callPlanner(planner, message, history, model, effort, detailLevel));
    return {
      planner,
      modelLabel: modelLabel(planner),
      output,
      usedFallback: false
    };
  } catch (error) {
    const rawOutput = error instanceof Error ? error.message : String(error);
    const output = cleanPlannerOutput(rawOutput);
    if (output !== rawOutput && !output.includes("thread.started")) {
      return {
        planner,
        modelLabel: modelLabel(planner),
        output,
        usedFallback: false
      };
    }
    return {
      planner,
      modelLabel: modelLabel(planner),
      output: plannerErrorOutput(planner, output),
      usedFallback: true,
      error: `${label(planner)}: ${plannerErrorOutput(planner, output)}`
    };
  }
}

// ----- Code Task Brief (Chat -> Code) -----
// Sohbetten yapilandirilmis bir gorev brief'i uretir. Sadece kesin kararlar;
// vazgecilen fikirler haric. Kullanici brief'i duzenleyip onaylayinca run baslar.
const briefSections = [
  "# Code Task Brief",
  "## Amaç",
  "## Kesin Kararlar",
  "## Yapılacaklar",
  "## Yapılmayacaklar",
  "## Kısıtlar",
  "## Kabul Kriterleri",
  "## Roller",
  "## Test ve Doğrulama"
];

export async function generateBrief(history: ChatMessage[], message?: string, preferred?: PlannerSelection) {
  const order: PlannerId[] =
    preferred && preferred !== "auto" && preferred !== "all" ? [preferred] : ["codex", "claude", "antigravity"];
  for (const planner of order) {
    try {
      await assertPlannerReady(planner);
      const output = cleanPlannerOutput(await callPlannerRaw(planner, buildBriefPrompt(history, message)));
      if (output && output.length > 20) {
        return { brief: ensureBriefShape(output), planner, modelLabel: modelLabel(planner) };
      }
    } catch {
      // Sonraki ajana gec.
    }
  }
  return { brief: localBriefTemplate(history, message), planner: "local", modelLabel: "Yerel şablon" };
}

function buildBriefPrompt(history: ChatMessage[], message?: string) {
  return [
    "Sen Orkestra moderatörüsün. Aşağıdaki sohbetten bir CODE TASK BRIEF (kod görev özeti) çıkar.",
    "Yalnızca üzerinde KESİN karar verilenleri yaz; sohbette vazgeçilen, denenip iptal edilen fikirleri DAHİL ETME.",
    "Çıktıyı tam olarak şu Markdown başlıklarıyla, her başlık altını madde madde (kısa, uygulanabilir) doldurarak ver:",
    "",
    ...briefSections,
    "",
    "Açıklama metni veya giriş cümlesi ekleme; doğrudan brief ile başla. Türkçe yaz.",
    "",
    "Sohbet geçmişi:",
    formatHistory(history) || "(boş)",
    message ? `\nSon istek: ${message}` : ""
  ].join("\n");
}

// CLI brief'i basliksiz/eksik dondurdaginde en azindan iskeleti garanti et.
function ensureBriefShape(output: string) {
  if (output.includes("## Amaç") || output.includes("# Code Task Brief")) return output.trim();
  return `${briefSections[0]}\n\n## Amaç\n${output.trim()}`;
}

function localBriefTemplate(history: ChatMessage[], message?: string) {
  const goal = message || history.filter((m) => m.role === "user").slice(-1)[0]?.content || "(belirtilmedi)";
  return [
    "# Code Task Brief",
    "",
    "## Amaç",
    goal,
    "",
    "## Kesin Kararlar",
    "- (CLI brief üretemedi; lütfen elle doldur)",
    "",
    "## Yapılacaklar",
    "- ",
    "",
    "## Yapılmayacaklar",
    "- ",
    "",
    "## Kısıtlar",
    "- Local-first çalışmalı.",
    "",
    "## Kabul Kriterleri",
    "- ",
    "",
    "## Roller",
    "- Planlayıcı / Kodlayıcı / Denetçi / Düzeltici",
    "",
    "## Test ve Doğrulama",
    "- "
  ].join("\n");
}

export async function getCliStatuses(): Promise<CliToolStatus[]> {
  const [claude, codex, antigravity] = await Promise.all([
    getClaudeStatus(),
    getCodexStatus(),
    getAntigravityStatus()
  ]);
  return Promise.all([claude, codex, antigravity].map(enrichWithUsage));
}

// cli-status'a saglayicinin canli usage API'sinden 5s/haftalik limit ve dinamik
// model listesi ekler.
async function enrichWithUsage(status: CliToolStatus): Promise<CliToolStatus> {
  const usage = await getUsageFor(status.id);
  const modelOptions = await getModelOptions(status.id, usage);
  return {
    ...status,
    usage,
    modelOptions,
    models: modelOptions.map((m) => m.id),
    quotaOk: status.quotaOk && !usage?.limited
  };
}

export async function testCli(id: PlannerId): Promise<CliToolStatus> {
  const base = await statusFor(id);
  if (!base.installed) return base;
  try {
    const output = await callPlanner(id, "Yanıtı sadece OK olan kısa bir sistem testi yap.", []);
    return {
      ...base,
      authenticated: true,
      quotaOk: true,
      responding: Boolean(output.trim()),
      lastError: undefined
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = normalizeCliError(id, rawMessage, base.authenticated);
    return {
      ...base,
      responding: false,
      quotaOk: !isQuotaError(message),
      authenticated: base.authenticated && !/oturum gerekli|giriş gerekli/i.test(message),
      lastError: message
    };
  }
}

export async function logoutCli(id: PlannerId) {
  if (id === "claude") {
    loggedOutOverrides.add("claude");
    clearClaudeEnvironmentAuth();
    await runTool("claude", ["auth", "logout"], "", 15_000).catch(() => "");
    return statusFor(id);
  }
  if (id === "antigravity") {
    loggedOutOverrides.add("antigravity");
    return statusFor(id);
  }
  loggedOutOverrides.add("codex");
  await runTool("codex", ["logout"], "", 15_000).catch(() => "");
  return statusFor(id);
}

function clearClaudeEnvironmentAuth() {
  for (const key of Object.keys(process.env)) {
    const normalized = key.toUpperCase();
    if (normalized.startsWith("ANTHROPIC_") || normalized.startsWith("CLAUDE_CODE_")) {
      delete process.env[key];
    }
  }
}

export function startLoginCli(id: PlannerId) {
  loggedOutOverrides.delete(id);
  if (id === "claude") clearClaudeEnvironmentAuth();
  const command = loginCommand(id);
  if (process.platform === "win32") {
    if (id === "antigravity") {
      spawn("powershell.exe", ["-NoExit", "-Command", "agy login"], {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      }).unref();
      return {
        ok: true,
        message: `${label(id)} login komutu yeni bir PowerShell terminalinde baslatildi: agy login`
      };
    }
    spawn("cmd.exe", ["/d", "/c", "start", "", "cmd.exe", "/d", "/k", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }).unref();
  } else {
    spawn("sh", ["-lc", command], {
      detached: true,
      stdio: "ignore"
    }).unref();
  }
  return {
    ok: true,
    message: `${label(id)} login komutu yeni bir terminalde baslatildi: ${command}`
  };
}

function agyExecutablePath() {
  const agyExe = join(process.env.USERPROFILE ?? "", "AppData", "Local", "agy", "bin", "agy.exe");
  return existsSync(agyExe) ? agyExe : undefined;
}

function getAgyLogStatus() {
  const agyStateDir = join(process.env.USERPROFILE ?? "", ".gemini", "antigravity-cli");
  const logPath = join(agyStateDir, "cli.log");
  const installed = existsSync(agyStateDir) || Boolean(agyExecutablePath());
  if (!existsSync(logPath)) return { installed, authenticated: false };
  try {
    const log = readFileSync(logPath, "utf8");
    const authenticated = /OAuth:\s+authenticated successfully|authenticated via keyring|Auth done received/i.test(log);
    const loggedOut = /You are not logged into Antigravity/i.test(log);
    return {
      installed,
      authenticated: authenticated && !loggedOut ? true : authenticated
    };
  } catch {
    return { installed, authenticated: false };
  }
}

function readLatestAgyResponse(startedAt: number) {
  const brainDir = join(process.env.USERPROFILE ?? "", ".gemini", "antigravity-cli", "brain");
  if (!existsSync(brainDir)) return undefined;

  const candidates = readdirSync(brainDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(brainDir, entry.name, ".system_generated", "logs", "transcript.jsonl"))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .filter((item) => item.mtimeMs >= startedAt - 2_000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of candidates) {
    const response = readAgyResponseFromTranscript(candidate.path, startedAt);
    if (response) return response;
  }
  return undefined;
}

function readAgyResponseFromTranscript(path: string, startedAt: number) {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as {
        source?: string;
        type?: string;
        status?: string;
        created_at?: string;
        content?: string;
      };
      if (parsed.created_at && Date.parse(parsed.created_at) < startedAt - 2_000) continue;
      if (parsed.source === "MODEL" && parsed.status === "DONE" && parsed.content?.trim()) {
        return parsed.content.trim();
      }
    } catch {
      // Ignore partial or non-JSON transcript lines.
    }
  }
  return undefined;
}

// Claude cagrilari sirayla calistirilir ki ayni anda ust uste binmesin.
let claudeQueue: Promise<unknown> = Promise.resolve();

// Bir planner'a HAZIR bir prompt gonderir. Sohbet akisi prompt'u buildPlannerPrompt/
// buildClaudePrompt ile kurar; Tartisma modu ise kendi debate prompt'unu kurup buraya verir.
function callPlannerRaw(id: PlannerId, prompt: string, model?: string, effort?: EffortLevel): Promise<string> {
  if (id === "claude") {
    const run = claudeQueue.then(() => runClaude(prompt, model, effort), () => runClaude(prompt, model, effort));
    claudeQueue = run.then(() => undefined, () => undefined);
    return run;
  }
  if (id === "antigravity") {
    const args = model && model !== "default" ? ["--model", model, "-p", prompt] : ["-p", prompt];
    const startedAt = Date.now();
    return runTool("agy", args, "", plannerTimeoutMs)
      .then(async (output) =>
        output.trim()
        || (await waitForTranscript(() => readLatestAgyResponse(startedAt), 8_000))
        || "Antigravity cevap verdi ancak transcript ciktisi okunamadi."
      )
      .catch(async (error) => {
        const transcript = await waitForTranscript(() => readLatestAgyResponse(startedAt), 8_000);
        if (transcript) return transcript;
        throw error;
      });
  }
  const effortArgs = effort ? ["-c", `model_reasoning_effort="${effort}"`] : [];
  const modelArgs = model && model !== "default" ? ["-m", model] : [];
  return runTool("codex", ["exec", "--ephemeral", "--json", ...effortArgs, ...modelArgs, "-"], prompt, plannerTimeoutMs);
}

// Claude'u headless `-p` modunda calistirir. Prompt stdin'den verilir: Windows'ta
// cmd.exe cok satirli argumani ilk satirda keser; stdin guvenle tasir.
async function runClaude(prompt: string, model?: string, effort?: EffortLevel) {
  const modelArgs = model && model !== "default" ? ["--model", model] : [];
  const args = ["-p", "--effort", effort ?? "low", ...modelArgs];
  return runTool("claude", args, prompt, claudeTimeoutMs);
}

async function buildClaudePrompt(message: string, history: ChatMessage[], detailLevel?: "low" | "medium" | "high") {
  const formattedHistory = await formatHistoryWithDetail(history, detailLevel);
  return [
    "Sen Orkestra'nın planlayıcı ajanısın; bu bir sohbet oturumudur, kod tabanına müdahale etme.",
    "Aşağıdaki konuşma geçmişini dikkate al — geçmişte senin dışında Gemini ve Codex gibi başka AI'lar da yanıt vermiş olabilir, onların söylediklerini de bağlam olarak kullan.",
    "cwd'deki proje dosyalarını veya hafızayı bağlam alma.",
    "Kullanıcı sohbet ederse kısa ve doğal yanıt ver.",
    "Kullanıcı bir uygulama, site, script, kod veya proje isterse uygulanabilir bir plan çıkar ve kod aşamasına geçilebileceğini söyle.",
    "Yanıtını Türkçe, net ve aksiyon odaklı tut. Türkçe karakterleri doğru kullan.",
    "",
    "Konuşma geçmişi:",
    formattedHistory || "(boş)",
    "",
    `Kullanıcı: ${message}`
  ].join("\n");
}

async function waitForTranscript(read: () => string | undefined, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return read();
}

function loginCommand(id: PlannerId) {
  if (process.platform !== "win32") {
    if (id === "codex") return "codex login";
    if (id === "claude") return "claude auth login --claudeai";
    return "gemini";
  }

  const npmDir = join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "npm");
  if (id === "claude") {
    return "claude auth login";
  }
  if (id === "codex") {
    return "codex login";
  }
  return "agy login";
}

async function callPlanner(id: PlannerId, message: string, history: ChatMessage[], model?: string, effort?: EffortLevel, detailLevel?: "low" | "medium" | "high") {
  const prompt = id === "claude" ? await buildClaudePrompt(message, history, detailLevel) : await buildPlannerPrompt(message, history, detailLevel);
  return callPlannerRaw(id, prompt, model, effort);
}

// ----- Tartisma (Kurul) modu -----
// Secilen ajanlar sirayla, o ana kadarki tum tartismayi gorerek birbirlerine cevap
// verir (round-robin). Her ajan cevabi tamamlandikca yield edilir; sonunda Orkestra
// bir karar ozeti cikarir. Maliyet yuksek oldugundan tur sayisi 1-3 ile sinirlidir.
export type DebateTurn = { planner: PlannerId; modelLabel: string; content: string };
export type DebateEvent =
  | { type: "message"; planner: PlannerId; modelLabel: string; content: string; round: number }
  | { type: "summary"; content: string }
  | { type: "error"; planner: PlannerId; modelLabel: string; message: string }
  | { type: "done" };

export async function* runDebate(
  participants: PlannerId[],
  message: string,
  history: ChatMessage[],
  rounds: number,
  model?: string,
  effort?: EffortLevel,
  detailLevel?: "low" | "medium" | "high"
): AsyncGenerator<DebateEvent> {
  const active: PlannerId[] = [];
  for (const planner of participants) {
    try {
      await assertPlannerReady(planner);
      active.push(planner);
    } catch {
      // Limitli veya giris yapilmamis ajan tartismadan cikarilir.
    }
  }
  if (active.length < 2) {
    yield { type: "error", planner: active[0] ?? "claude", modelLabel: "Sistem", message: "Tartışma için en az iki doğrulanmış ajan gerekli." };
    yield { type: "done" };
    return;
  }

  const turns: DebateTurn[] = [];
  const safeRounds = Math.min(3, Math.max(1, rounds));
  for (let round = 1; round <= safeRounds; round++) {
    for (const planner of active) {
      const prompt = await buildDebatePromptWithDetail(planner, message, history, turns, round, safeRounds, active, detailLevel);
      try {
        const content = cleanPlannerOutput(await callPlannerRaw(planner, prompt, model, effort));
        turns.push({ planner, modelLabel: modelLabel(planner), content });
        yield { type: "message", planner, modelLabel: modelLabel(planner), content, round };
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        yield { type: "error", planner, modelLabel: modelLabel(planner), message: cleanPlannerOutput(raw) };
      }
    }
  }

  if (turns.length) {
    const summarizer = active[0];
    try {
      const summary = cleanPlannerOutput(await callPlannerRaw(summarizer, buildDebateSummaryPrompt(message, turns), model, effort));
      yield { type: "summary", content: summary };
    } catch {
      // Ozet basarisizsa sessiz gec; ham tartisma yine de kullanicida.
    }
  }
  yield { type: "done" };
}

async function buildDebatePromptWithDetail(
  planner: PlannerId,
  message: string,
  history: ChatMessage[],
  turns: DebateTurn[],
  round: number,
  totalRounds: number,
  participants: PlannerId[],
  detailLevel?: "low" | "medium" | "high"
): Promise<string> {
  const others = participants.filter((p) => p !== planner).map(label).join(", ");
  
  // Format prior chat history with selected detail level
  const formattedHistory = await formatHistoryWithDetail(history, detailLevel);

  const level = detailLevel || "high";
  const threshold = level === "low" ? 1 : level === "medium" ? 3 : 999;

  let debateSoFar = "";
  if (turns.length === 0) {
    debateSoFar = "(henüz kimse konuşmadı, tartışmayı sen açıyorsun)";
  } else if (turns.length <= threshold) {
    debateSoFar = turns.map((turn) => `${turn.modelLabel}: ${turn.content}`).join("\n\n");
  } else {
    const olderTurns = turns.slice(0, -threshold);
    const recentTurns = turns.slice(-threshold);

    const formattedOlder = olderTurns.map((turn) => `${turn.modelLabel}: ${turn.content}`).join("\n\n");
    const formattedRecent = recentTurns.map((turn) => `${turn.modelLabel}: ${turn.content}`).join("\n\n");

    let olderSummary = "[Önceki kurul tartışması turları]";
    try {
      const summarizer = await getFirstReadyPlanner();
      if (summarizer) {
        const summaryPrompt = [
          "Sen Orkestra kurul moderatörüsün. Aşağıdaki kurul tartışmasının şu ana kadarki kısmını çok kısa, net bir paragrafla Türkçe olarak özetle.",
          "Sadece her ajanın temel argümanını ve varılan kararları belirt. Detayları atla.",
          "",
          "Tartışma kaydı:",
          formattedOlder,
          "",
          "Şimdi kısa özetini yaz:"
        ].join("\n");
        const summaryRaw = await callPlannerRaw(summarizer, summaryPrompt);
        olderSummary = `[Önceki Tartışma Turlarının Özeti: ${cleanPlannerOutput(summaryRaw)}]`;
      }
    } catch (err) {
      console.error("buildDebatePromptWithDetail: özetleme hatası:", err);
    }

    debateSoFar = `${olderSummary}\n\n${formattedRecent}`;
  }

  return [
    `Sen ${modelLabel(planner)} olarak Orkestra'da bir KURUL TARTIŞMASInın katılımcısısın.`,
    `Diğer katılımcılar: ${others}. Tur ${round}/${totalRounds}.`,
    "Amaç birlikte en iyi kararı bulmak. Diğer ajanların söylediklerine DOĞRUDAN cevap ver: katıldığın/katılmadığın noktaları belirt, eksikleri tamamla, alternatif sun.",
    "Kısa ve öz konuş (en fazla birkaç paragraf), kendini tekrarlama, sadede gel. Türkçe yaz.",
    "",
    "Konuşulan asıl konu / kullanıcı isteği:",
    message,
    "",
    "Önceki sohbet geçmişi:",
    formattedHistory || "(boş)",
    "",
    "Şu ana kadarki tartışma:",
    debateSoFar,
    "",
    `Şimdi ${modelLabel(planner)} olarak sıradaki katkını yap:`
  ].join("\n");
}

function buildDebateSummaryPrompt(message: string, turns: DebateTurn[]) {
  const transcript = turns.map((turn) => `${turn.modelLabel}: ${turn.content}`).join("\n\n");
  return [
    "Sen Orkestra moderatörüsün. Aşağıda birden fazla AI ajanının bir konuyu tartıştığı kayıt var.",
    "Bu tartışmadan ORTAK KARAR ÖZETİ çıkar. Şunları içersin:",
    "- Üzerinde uzlaşılan noktalar",
    "- Anlaşmazlık varsa kısa not",
    "- Önerilen nihai yaklaşım / yapılacaklar (madde madde)",
    "Kısa, net ve Türkçe yaz. Yeni tartışma açma; sadece özetle.",
    "",
    `Asıl konu: ${message}`,
    "",
    "Tartışma kaydı:",
    transcript
  ].join("\n");
}

async function assertPlannerReady(id: PlannerId) {
  const status = await statusFor(id);
  if (!status.installed) throw new Error("CLI kurulu değil.");
  if (!status.authenticated) throw new Error("Giriş gerekli. Önce Login düğmesiyle oturum açın.");
  if (!status.quotaOk) throw new Error("Limit veya kota sorunu algılandı.");
}

async function statusFor(id: PlannerId) {
  const base = id === "claude" ? await getClaudeStatus() : id === "codex" ? await getCodexStatus() : await getAntigravityStatus();
  return await enrichWithUsage(base);
}

async function getClaudeStatus(): Promise<CliToolStatus> {
  try {
    const output = await runTool("claude", ["auth", "status"], "", statusTimeoutMs);
    const lower = output.toLowerCase();
    const parsed = safeJsonParse<{ loggedIn?: boolean; authMethod?: string; apiKeySource?: string }>(output);
    const apiKeyOnly = parsed?.authMethod === "api_key";
    const hasClaudeAccount = parsed?.authMethod === "claude.ai";
    if (hasClaudeAccount && parsed?.loggedIn) loggedOutOverrides.delete("claude");
    const authenticated = loggedOutOverrides.has("claude")
      ? false
      : typeof parsed?.loggedIn === "boolean"
      ? parsed.loggedIn && !apiKeyOnly
      : lower.includes("authenticated") || lower.includes("logged in") || lower.includes("loggedin: true");
    return {
      id: "claude",
      name: "Claude Code CLI",
      installed: true,
      authenticated,
      quotaOk: !isQuotaError(output),
      responding: false,
      models: ["default"],
      limits: defaultLimitPatterns(),
      lastError: authenticated ? undefined : "Giriş gerekli."
    };
  } catch (error) {
    return statusError("claude", "Claude Code CLI", error);
  }
}

async function getCodexStatus(): Promise<CliToolStatus> {
  try {
    const output = await runTool("codex", ["login", "status"], "", statusTimeoutMs);
    const authPath = join(process.env.USERPROFILE ?? "", ".codex", "auth.json");
    const authJson = existsSync(authPath) ? readFileSync(authPath, "utf8") : "";
    const hasToken = /"tokens"\s*:|"OPENAI_API_KEY"\s*:\s*"/.test(authJson);
    const badAuth = /not logged in|not authenticated|giriş yapılmadı|oturum açılmadı/i.test(output);
    return {
      id: "codex",
      name: "Codex CLI",
      installed: true,
      authenticated: !loggedOutOverrides.has("codex") && (hasToken || /logged in/i.test(output)) && !badAuth,
      quotaOk: !isQuotaError(output),
      responding: false,
      models: ["default"],
      limits: defaultLimitPatterns(),
      lastError: badAuth ? "Codex oturumu gecersiz gorunuyor. codex login gerekli." : undefined
    };
  } catch (error) {
    const authPath = join(process.env.USERPROFILE ?? "", ".codex", "auth.json");
    const authJson = existsSync(authPath) ? readFileSync(authPath, "utf8") : "";
    const hasToken = /"tokens"\s*:|"OPENAI_API_KEY"\s*:\s*"/.test(authJson);
    if (hasToken) {
      return {
        id: "codex",
        name: "Codex CLI",
        installed: true,
        authenticated: !loggedOutOverrides.has("codex"),
        quotaOk: true,
        responding: false,
        models: modelsFor("codex"),
        limits: defaultLimitPatterns(),
        lastError: "Auth dosyası var; Codex CLI login status yenileme istiyor."
      };
    }
    return statusError("codex", "Codex CLI", error);
  }
}

async function getAntigravityStatus(): Promise<CliToolStatus> {
  const agyLogStatus = getAgyLogStatus();
  if (agyLogStatus.authenticated || agyLogStatus.installed) {
    return {
      id: "antigravity",
      name: "Antigravity / Gemini CLI",
      installed: agyLogStatus.installed,
      authenticated: !loggedOutOverrides.has("antigravity") && agyLogStatus.authenticated,
      quotaOk: true,
      responding: false,
      models: modelsFor("antigravity"),
      limits: defaultLimitPatterns(),
      lastError: agyLogStatus.authenticated ? undefined : "Giris gerekli.",
      hint: agyLogStatus.authenticated
        ? "Antigravity OAuth oturumu logdan dogrulandi."
        : "Antigravity CLI kurulu; agy login gerekli."
    };
  }
  try {
    const output = await runTool("agy", ["login", "status"], "", statusTimeoutMs).catch(async () =>
      runTool("agy", ["auth", "status"], "", statusTimeoutMs)
    );
    const authenticated = !loggedOutOverrides.has("antigravity") && !isAuthError(output);
    return {
      id: "antigravity",
      name: "Antigravity / Gemini CLI",
      installed: true,
      authenticated,
      quotaOk: !isQuotaError(output),
      responding: false,
      models: modelsFor("antigravity"),
      limits: defaultLimitPatterns(),
      lastError: authenticated ? undefined : "Giris gerekli.",
      hint: "Antigravity terminalindeki agy login oturumu kullanilir."
    };
  } catch {
    try {
    const output = await runTool("gemini", ["--version"], "", statusTimeoutMs);
    const geminiDir = join(process.env.USERPROFILE ?? "", ".gemini");
    const hasOAuth = existsSync(join(geminiDir, "oauth_creds.json"));
    const hasAccounts = existsSync(join(geminiDir, "google_accounts.json"));
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
    const authenticated = !loggedOutOverrides.has("antigravity") && hasApiKey;
    return {
      id: "antigravity",
      name: "Gemini CLI",
      installed: true,
      authenticated,
      quotaOk: !isQuotaError(output),
      responding: false,
      models: modelsFor("antigravity"),
      limits: defaultLimitPatterns(),
      lastError: authenticated
        ? undefined
        : hasOAuth || hasAccounts
          ? "Gemini oturum dosyasi var ama headless sohbet icin GEMINI_API_KEY gerekli."
          : "Giris gerekli.",
      hint: "Gemini CLI Claude oturumundan bagimsizdir; headless sohbet icin GEMINI_API_KEY ister."
    };
  } catch (error) {
    return statusError("antigravity", "Gemini CLI", error);
  }

  const claude = await getClaudeStatus();
  const authenticated = !loggedOutOverrides.has("antigravity") && claude.authenticated;
  return {
    ...claude,
    id: "antigravity",
    name: "Antigravity Gemini CLI",
    authenticated,
    models: ["antigravity/gemini-3-flash-agent", "antigravity/gemini-3.1-pro-high"],
    limits: defaultLimitPatterns(),
    lastError: authenticated ? undefined : "Giriş gerekli.",
    hint: "Claude CLI üzerinden antigravity/gemini-3-flash-agent modeliyle çalışır."
  };
}

}

function statusError(id: PlannerId, name: string, error: unknown): CliToolStatus {
  const message = normalizeCliError(id, error instanceof Error ? error.message : String(error), false);
  return {
    id,
    name,
    installed: !/ENOENT|not recognized|bulunam/i.test(message),
    authenticated: !isAuthError(message),
    quotaOk: !isQuotaError(message),
    responding: false,
    models: modelsFor(id),
    limits: defaultLimitPatterns(),
    lastError: message
  };
}

function normalizeCliError(id: PlannerId, message: string, authenticated: boolean) {
  if (id === "antigravity" && /GEMINI_API_KEY/i.test(message)) {
    return "oturum gerekli: Gemini CLI headless sohbet icin GEMINI_API_KEY istiyor. Login Gemini terminalini acar; Test gecmeden chat listesine alinmaz.";
  }
  if (id === "antigravity" && /not recognized|ENOENT|access is denied|erişim engellendi|permission denied/i.test(message)) {
    return "Antigravity CLI backend tarafindan calistirilamadi. Login terminali bagli, ancak UI cevap yakalama icin agy komutuna erisim gerekiyor.";
  }
  if (id === "codex" && authenticated && /not logged in|not authenticated/i.test(message)) {
    return "Codex login doğrulandı; exec komutu oturum bilgisini okuyamadı. Login düğmesiyle yeni terminalde tekrar oturum açmayı deneyin.";
  }
  if (/not logged in|not authenticated/i.test(message)) return "Giriş gerekli.";
  return message;
}

function safeJsonParse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function runTool(command: string, args: string[], input: string, timeoutMs = plannerTimeoutMs) {
  return new Promise<string>((resolve, reject) => {
    const resolved = resolveTool(command);
    const executable = resolved.executable;
    const finalArgs = [...resolved.prefixArgs, ...args];

    const child = execFile(executable, finalArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 5,
      env: envForTool(command)
    }, (error, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ? `\n${stderr}` : ""}`.trim();
      if (error) {
        const timedOut = error.killed || /timed out/i.test(error.message);
        reject(new Error(output || (timedOut ? `${command} yanıt vermedi veya zaman aşımına uğradı.` : error.message)));
        return;
      }
      resolve(output);
    });

    child.stdin?.end(input || undefined);
  });
}

function envForTool(command: string) {
  if (command !== "claude") return process.env;
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    const normalized = key.toUpperCase();
    if (normalized.startsWith("ANTHROPIC_") || normalized.startsWith("CLAUDE_CODE_")) {
      delete env[key];
    }
  }
  return env;
}

function resolveTool(command: string) {
  if (process.platform !== "win32") {
    return { executable: command, prefixArgs: [] as string[] };
  }

  const npmDir = join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "npm");
  if (command === "claude") {
    const claudeCmd = join(npmDir, "claude.cmd");
    if (existsSync(claudeCmd)) return { executable: "cmd.exe", prefixArgs: ["/d", "/s", "/c", "claude"] };
    const claudeExe = join(npmDir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(claudeExe)) return { executable: claudeExe, prefixArgs: [] as string[] };
  }
  if (command === "codex") {
    const codexJs = join(npmDir, "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(codexJs)) return { executable: "node", prefixArgs: [codexJs] };
  }
  if (command === "gemini") {
    const geminiJs = join(npmDir, "node_modules", "@google", "gemini-cli", "bundle", "gemini.js");
    if (existsSync(geminiJs)) return { executable: "node", prefixArgs: [geminiJs] };
  }
  if (command === "agy") {
    const agyExe = agyExecutablePath();
    if (agyExe) return { executable: agyExe, prefixArgs: [] as string[] };
    const agyBin = join(process.env.USERPROFILE ?? "", "AppData", "Local", "agy", "bin");
    if (existsSync(agyBin)) {
      return { executable: "cmd.exe", prefixArgs: ["/d", "/s", "/c", `set "PATH=${agyBin};%PATH%" && agy`] };
    }
    const agyCmd = join(npmDir, "agy.cmd");
    if (existsSync(agyCmd)) return { executable: "cmd.exe", prefixArgs: ["/d", "/s", "/c", agyCmd] };
    return { executable: "cmd.exe", prefixArgs: ["/d", "/s", "/c", "agy"] };
  }

  return { executable: command, prefixArgs: [] as string[] };
}
function formatHistory(history: ChatMessage[]) {
  return history
    .map((item) => {
      const who = item.role === "user" ? "Kullanıcı" : item.modelLabel || label(item.planner ?? "") || "Asistan";
      return `${who}: ${item.content}`;
    })
    .join("\n");
}

async function getFirstReadyPlanner(): Promise<PlannerId | undefined> {
  try {
    const claudeStatus = await getClaudeStatus();
    if (claudeStatus.installed && claudeStatus.authenticated) return "claude";
  } catch {}
  try {
    const codexStatus = await getCodexStatus();
    if (codexStatus.installed && codexStatus.authenticated) return "codex";
  } catch {}
  try {
    const agyStatus = await getAntigravityStatus();
    if (agyStatus.installed && agyStatus.authenticated) return "antigravity";
  } catch {}
  return undefined;
}

async function formatHistoryWithDetail(
  history: ChatMessage[],
  detailLevel?: "low" | "medium" | "high"
): Promise<string> {
  const level = detailLevel || "high";
  const threshold = level === "low" ? 2 : level === "medium" ? 4 : 12;
  
  if (history.length <= threshold) {
    return formatRawHistory(history);
  }

  const older = history.slice(0, -threshold);
  const recent = history.slice(-threshold);

  const formattedRecent = formatRawHistory(recent);
  const formattedOlder = formatRawHistory(older);

  try {
    const summarizer = await getFirstReadyPlanner();
    if (summarizer) {
      const summaryPrompt = [
        "Sen Orkestra moderatörüsün. Aşağıdaki konuşma geçmişini çok kısa, net bir paragrafla Türkçe olarak özetle.",
        "Özette sadece konuşulan temel konuları ve varılan kararları belirt. Gereksiz detayları atla.",
        "",
        "Özetlenecek geçmiş:",
        formattedOlder,
        "",
        "Şimdi kısa özetini yaz:"
      ].join("\n");
      const summaryRaw = await callPlannerRaw(summarizer, summaryPrompt);
      const summary = cleanPlannerOutput(summaryRaw);
      return `[Önceki Konuşma Özeti: ${summary}]\n\n${formattedRecent}`;
    }
  } catch (err) {
    console.error("formatHistoryWithDetail: özetleme hatası, fallback uygulanıyor:", err);
  }

  return `[Önceki konuşmalar özetlenemedi; son ${threshold} mesaj gösteriliyor]\n\n${formattedRecent}`;
}

function formatRawHistory(messages: ChatMessage[]) {
  return messages
    .map((item) => {
      const who = item.role === "user" ? "Kullanıcı" : item.modelLabel || label(item.planner ?? "") || "Asistan";
      return `${who}: ${item.content}`;
    })
    .join("\n");
}

async function buildPlannerPrompt(message: string, history: ChatMessage[], detailLevel?: "low" | "medium" | "high") {
  const formattedHistory = await formatHistoryWithDetail(history, detailLevel);
  return [
    "Sadece Orkestra chat gecmisini dikkate al; eski CLI/proje oturum baglamindan devam etme.",
    "Sen Orkestra'nın planlayıcı ajanısın. Geçmişte başka AI'lar (Claude, Gemini, Codex) da yanıt vermiş olabilir; onların mesajlarını da bağlam al.",
    "Kullanıcı sohbet ederse kısa ve doğal yanıt ver.",
    "Kullanıcı bir uygulama, site, script, kod veya proje isterse uygulanabilir bir plan çıkar ve kod aşamasına geçilebileceğini söyle.",
    "Yanıtını Türkçe, net ve aksiyon odaklı tut. Türkçe karakterleri doğru kullan.",
    "",
    "Geçmiş:",
    formattedHistory || "(boş)",
    "",
    `Kullanıcı: ${message}`
  ].join("\n");
}
function localPlannerReply(message: string) {
  if (detectPipelineIntent(message)) {
    return [
      "Plan hazır. İstenen işi kod aşamasına aktarabiliriz.",
      "",
      "1. Gereksinimi küçük parçalara ayıracağım.",
      "2. Builder ajanına uygulanabilir dosya ve kabul kriterleriyle devredeceğim.",
      "3. Reviewer ve fixer ajanları sonucu kontrol edip düzeltecek."
    ].join("\n");
  }
  return "Merhaba, ben Orkestra planlayıcısı. Bana yapmak istediğin projeyi anlatabilir veya mevcut ajanları yönetebilirsin.";
}

export function detectPipelineIntent(text: string) {
  return /(\b(yap|oluştur|olustur|kodla|geliştir|gelistir|uygulama|site|web|script|proje|dosya|component|api)\b)/i.test(text);
}

function cleanPlannerOutput(output: string) {
  const trimmed = output
    .split(/\r?\n/)
    .filter((line) => !line.includes("Reading additional input from stdin") && !line.trim().startsWith("Reading ad"))
    .join("\n")
    .trim();
  if (!trimmed) return "(CLI boş yanıt verdi.)";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "object" && parsed && "message" in parsed) {
      return String((parsed as { message: unknown }).message);
    }
  } catch {
    // Codex JSON output may be newline-delimited; plain text is fine for the UI.
  }

  const agentMessages = trimmed
    .split(/\r?\n/)
    .map((line) => {
      try {
        const parsed = JSON.parse(line.trim()) as {
          type?: string;
          item?: { type?: string; text?: string };
        };
        if (parsed.type === "item.completed" && parsed.item?.type === "agent_message") {
          return parsed.item.text;
        }
      } catch {
        return undefined;
      }
      return undefined;
    })
    .filter(Boolean);

  if (agentMessages.length) return agentMessages.join("\n\n");
  return trimmed;
}

function plannerErrorOutput(planner: PlannerId, output: string) {
  if (planner === "codex" && /"type"\s*:\s*"thread\.started"|"type"\s*:\s*"turn\.started"/i.test(output)) {
    return "Codex yanıtı tamamlanmadan zaman aşımına uğradı. Lütfen tekrar deneyin.";
  }
  if (planner === "claude" && /zaman a|timed out|timeout/i.test(output)) {
    return "Claude yanıt vermedi veya zaman aşımına uğradı.";
  }
  return output;
}

function isQuotaError(text: string) {
  return /429|quota|rate limit|usage limit|too many requests/i.test(text);
}

function isAuthError(text: string) {
  if (/GEMINI_API_KEY/i.test(text)) return true;
  return /401|token_invalidated|unauthorized|login|auth|expired|invalid token|giriş gerekli|oturum gerekli|giris gerekli/i.test(text);
}

function label(id: string) {
  if (id === "claude") return "Claude";
  if (id === "codex") return "Codex";
  if (id === "antigravity") return "Gemini";
  return id;
}

function modelLabel(id: string) {
  if (id === "claude") return "Claude Code";
  if (id === "codex") return "OpenAI Codex";
  if (id === "antigravity") return "Gemini CLI";
  return "Yerel fallback";
}

function modelsFor(id: PlannerId) {
  if (id === "codex") return ["default"];
  if (id === "antigravity") return ["default"];
  return ["default"];
}

function defaultLimitPatterns() {
  return ["rate limit", "usage limit", "quota", "try again later", "429", "login expired", "zaman aşımı"];
}

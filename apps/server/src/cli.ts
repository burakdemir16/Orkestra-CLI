import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ChatMessage, CliToolStatus } from "../../../packages/shared/types";
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
  model?: string
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
    const results = await Promise.all(planners.map((planner) => runSinglePlanner(planner, message, history, model)));
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
      const output = await callPlanner(planner, message, history, model);
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

async function runSinglePlanner(planner: PlannerId, message: string, history: ChatMessage[], model?: string) {
  try {
    await assertPlannerReady(planner);
    const output = cleanPlannerOutput(await callPlanner(planner, message, history, model));
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

// Claude'u headless `-p` modunda calistirir. Paylasilan sohbet gecmisini (diger
// AI'larin mesajlari dahil) her cagrida prompt'a koyar; boylece Claude tum
// konusmayi gorur. Cagrilar sirayla calistirilir ki ust uste binmesin.
let claudeQueue: Promise<unknown> = Promise.resolve();
function callClaude(message: string, history: ChatMessage[], model?: string) {
  const run = claudeQueue.then(
    () => sendClaude(message, history, model),
    () => sendClaude(message, history, model)
  );
  claudeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function sendClaude(message: string, history: ChatMessage[], model?: string) {
  const modelArgs = model && model !== "default" ? ["--model", model] : [];
  // Prompt'u argüman yerine stdin'den ver: Windows'ta cmd.exe çok satırlı argümanı
  // ilk satırda kesiyor; stdin çok satırlı metni güvenle taşır.
  const args = ["-p", "--effort", "low", ...modelArgs];
  return runTool("claude", args, buildClaudePrompt(message, history), claudeTimeoutMs);
}

function buildClaudePrompt(message: string, history: ChatMessage[]) {
  return [
    "Sen Orkestra'nın planlayıcı ajanısın; bu bir sohbet oturumudur, kod tabanına müdahale etme.",
    "Aşağıdaki konuşma geçmişini dikkate al — geçmişte senin dışında Gemini ve Codex gibi başka AI'lar da yanıt vermiş olabilir, onların söylediklerini de bağlam olarak kullan.",
    "cwd'deki proje dosyalarını veya hafızayı bağlam alma.",
    "Kullanıcı sohbet ederse kısa ve doğal yanıt ver.",
    "Kullanıcı bir uygulama, site, script, kod veya proje isterse uygulanabilir bir plan çıkar ve kod aşamasına geçilebileceğini söyle.",
    "Yanıtını Türkçe, net ve aksiyon odaklı tut. Türkçe karakterleri doğru kullan.",
    "",
    "Konuşma geçmişi:",
    formatHistory(history) || "(boş)",
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

function callPlanner(id: PlannerId, message: string, history: ChatMessage[], model?: string) {
  if (id === "claude") {
    return callClaude(message, history, model);
  }
  const prompt = buildPlannerPrompt(message, history);
  if (id === "antigravity") {
    const args = model && model !== "default"
      ? ["--model", model, "-p", prompt]
      : ["-p", prompt];
    const startedAt = Date.now();
    return runTool("agy", args, "", plannerTimeoutMs)
      .then(async (output) =>
        output.trim()
        || await waitForTranscript(() => readLatestAgyResponse(startedAt), 8_000)
        || "Antigravity cevap verdi ancak transcript ciktisi okunamadi."
      )
      .catch(async (error) => {
        const transcript = await waitForTranscript(() => readLatestAgyResponse(startedAt), 8_000);
        if (transcript) return transcript;
        throw error;
      });
  }
  const args = model && model !== "default"
    ? ["exec", "--ephemeral", "--json", "-m", model, "-"]
    : ["exec", "--ephemeral", "--json", "-"];
  return runTool("codex", args, prompt, plannerTimeoutMs);
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

// Paylasilan sohbet gecmisini kaynak etiketiyle bicimler; boylece her planlayici
// kimin ne dedigini (Kullanici / Claude / Gemini / Codex) gorur.
function formatHistory(history: ChatMessage[]) {
  return history
    .slice(-12)
    .map((item) => {
      const who = item.role === "user" ? "Kullanıcı" : item.modelLabel || label(item.planner ?? "") || "Asistan";
      return `${who}: ${item.content}`;
    })
    .join("\n");
}

function buildPlannerPrompt(message: string, history: ChatMessage[]) {
  return [
    "Sadece Orkestra chat gecmisini dikkate al; eski CLI/proje oturum baglamindan devam etme.",
    "Sen Orkestra'nın planlayıcı ajanısın. Geçmişte başka AI'lar (Claude, Gemini, Codex) da yanıt vermiş olabilir; onların mesajlarını da bağlam al.",
    "Kullanıcı sohbet ederse kısa ve doğal yanıt ver.",
    "Kullanıcı bir uygulama, site, script, kod veya proje isterse uygulanabilir bir plan çıkar ve kod aşamasına geçilebileceğini söyle.",
    "Yanıtını Türkçe, net ve aksiyon odaklı tut. Türkçe karakterleri doğru kullan.",
    "",
    "Geçmiş:",
    formatHistory(history) || "(boş)",
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

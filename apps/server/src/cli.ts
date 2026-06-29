import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { ChatMessage, CliToolStatus, EffortLevel } from "../../../packages/shared/types";
import { getModelOptions, getUsageFor } from "./usage";
import { ensureAgyTrusted } from "./runner";

const exec = promisify(execFile);
const plannerTimeoutMs = 60_000;
const claudeTimeoutMs = 60_000;
const statusTimeoutMs = 6_000;
const loggedOutOverrides = new Set<PlannerId>();

export type PlannerId = "claude" | "codex" | "antigravity";
export type PlannerSelection = PlannerId | "auto" | "all";
// Paralel/Tartisma katilimcisi: ayni CLI'den farkli modeller ayri katilimci olabilir.
export type Participant = { cli: PlannerId; model?: string };

function participantLabel(cli: PlannerId, model?: string) {
  return model && model !== "default" ? `${modelLabel(cli)} · ${model}` : modelLabel(cli);
}

export async function runPlannerChat(
  preferred: PlannerSelection,
  message: string,
  history: ChatMessage[],
  model?: string,
  effort?: EffortLevel,
  detailLevel?: "low" | "medium" | "high",
  participants?: Participant[],
  cache?: ContextCache
) {
  // Bağlamı (özet + son N mesaj) BİR KEZ hesapla; tüm planlayıcılara hazır geçir
  // (multi'de her katılımcı ayrı özetlemesin) + cache ile artımlı özetle.
  const ctx = await buildContextWithCache(history, detailLevel, cache);
  const summaryMeta = { contextSummary: ctx.summary, summaryUpto: ctx.upto };
  if (preferred === "all") {
    // Katilimcilar verilmisse (CLI+model) onlari kullan; yoksa tum dogrulanmis CLI'lar (default model).
    let people: Participant[];
    if (participants && participants.length) {
      people = participants;
    } else {
      const statuses = await getCliStatuses();
      people = statuses
        .filter((status) => status.authenticated && status.quotaOk)
        .map((status) => ({ cli: status.id, model: undefined as string | undefined }));
    }
    if (!people.length) {
      return {
        planner: "local",
        modelLabel: "Sistem",
        output: "Doğrulanmış CLI yok. Önce kullanmak istediğiniz ajan için giriş yapın.",
        usedFallback: true,
        error: "Doğrulanmış CLI yok."
      };
    }
    const results = await Promise.all(
      people.map((p) => runSinglePlanner(p.cli, message, history, p.model ?? model, effort, detailLevel, participantLabel(p.cli, p.model), ctx.text))
    );
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
      error: allFailed ? results.map((result) => result.error).filter(Boolean).join("\n") : undefined,
      ...summaryMeta
    };
  }

  const order = preferred === "auto" ? (["codex", "claude", "antigravity"] as PlannerId[]) : [preferred];
  const errors: string[] = [];

  for (const planner of order) {
    try {
      await assertPlannerReady(planner);
      const output = await callPlanner(planner, message, history, model, effort, detailLevel, ctx.text);
      return {
        planner,
        modelLabel: modelLabel(planner),
        output: cleanPlannerOutput(output),
        usedFallback: planner !== preferred && preferred !== "auto",
        ...summaryMeta
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

async function runSinglePlanner(planner: PlannerId, message: string, history: ChatMessage[], model?: string, effort?: EffortLevel, detailLevel?: "low" | "medium" | "high", displayLabel?: string, preHistory?: string) {
  const labelText = displayLabel ?? modelLabel(planner);
  try {
    await assertPlannerReady(planner);
    const output = cleanPlannerOutput(await callPlanner(planner, message, history, model, effort, detailLevel, preHistory));
    return {
      planner,
      modelLabel: labelText,
      output,
      usedFallback: false
    };
  } catch (error) {
    const rawOutput = error instanceof Error ? error.message : String(error);
    const output = cleanPlannerOutput(rawOutput);
    if (output !== rawOutput && !output.includes("thread.started")) {
      return {
        planner,
        modelLabel: labelText,
        output,
        usedFallback: false
      };
    }
    return {
      planner,
      modelLabel: labelText,
      output: plannerErrorOutput(planner, output),
      usedFallback: true,
      error: `${labelText}: ${plannerErrorOutput(planner, output)}`
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
    "Açıklama metni veya giriş cümlesi ekleme; doğrudan brief ile başla. DİL: kullanıcının yazdığı dilde yaz (İngilizce→İngilizce, Türkçe→Türkçe).",
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

// ----- Ekip Planı (Faz 4) -----
// Plancı, projeyi alt-görevlere böler ve JSON olarak döner. Her görev: id, title,
// role (planner/builder/reviewer/fixer), folder (paralel izolasyon), dependsOn.
export async function generatePlan(
  history: ChatMessage[],
  message?: string,
  preferred?: PlannerSelection,
  analysis?: string,
  model?: string,
  agentCount?: number
) {
  // Fazları İCRA EDEN ajan belirler: operatörde operatör, ekipte ilgili ajan (preferred+model).
  const order: PlannerId[] =
    preferred && preferred !== "auto" && preferred !== "all" ? [preferred] : ["codex", "claude", "antigravity"];
  for (const planner of order) {
    try {
      await assertPlannerReady(planner);
      const raw = await callPlannerRaw(planner, buildPlanPrompt(history, message, analysis, agentCount), model);
      const tasks = parsePlanTasks(cleanPlannerOutput(raw));
      if (tasks.length) {
        return { tasks, planner, modelLabel: model && model !== "default" ? `${modelLabel(planner)} · ${model}` : modelLabel(planner) };
      }
    } catch {
      // sonraki ajana gec
    }
  }
  // Plancı üretemezse: tek görevlik basit plan.
  const goal = message || history.filter((m) => m.role === "user").slice(-1)[0]?.content || "Proje";
  return {
    tasks: [{ id: "task1", title: goal, role: "builder", folder: "", dependsOn: [] }],
    planner: "local",
    modelLabel: "Yerel şablon"
  };
}

function buildPlanPrompt(history: ChatMessage[], message?: string, analysis?: string, agentCount?: number) {
  const n = agentCount && agentCount > 1 ? agentCount : 0;
  // Dili KULLANICININ yazdığı metinden belirle (analiz AI üretimi olduğundan dili yanıltabilir).
  const lastUser = [...history].reverse().find((h) => h.role === "user")?.content;
  const sampleText = message || lastUser || analysis || "";
  const planLangRule = detectLang(sampleText) === "tr"
    ? "DİL: tüm 'title' ve açıklamaları Türkçe yaz."
    : "LANGUAGE: write every task 'title' and description in English. Do not use Turkish.";
  return [
    planLangRule,
    "Sen Orkestra ekip plancısısın. Aşağıdaki projeyi paralel/sıralı çalıştırılabilecek ALT-GÖREVLERE böl",
    "VE mantıklı FAZLARA ayır. Kararlarını AŞAĞIDAKİ OPERATÖR ANALİZİNE dayandır.",
    n ? `- ÖNEMLİ: ${n} ajan AYNI ANDA çalışacak. HER FAZDA EN AZ ${n} adet BAĞIMSIZ, ayrı-klasörlü paralel görev kur ki ${n} ajan da boş kalmadan çalışsın.` : "",
    "Çıktıyı SADECE geçerli JSON olarak ver (başka metin yok). Şema:",
    '{ "tasks": [ { "id": "kisa-id", "title": "ne yapılacağı (kısa, net)", "role": "builder", "folder": "klasor-adi", "dependsOn": ["onceki-id"], "phase": 1 } ] }',
    "Kurallar:",
    "- role yalnızca: builder | reviewer | fixer. (planner KULLANMA — plan zaten sende.)",
    "- HER GÖREV SOMUT KOD ÜRETSİN. 'Mimari tanımla', 'proje yapısını belirle', 'dokümana yaz' gibi",
    "  SADECE-DOKÜMAN / planlama görevleri YASAK. Her görev gerçek dosya/çalışan kod çıkarmalı.",
    "- PARALELLİK: Her fazda mümkün olduğunca BAĞIMSIZ, AYRI KLASÖRLÜ görevler kur (ör. backend, frontend,",
    "  veritabanı ayrı görevler) ki ajanlar AYNI ANDA çalışsın. Tek görevli faz kurmaktan kaçın.",
    "- Bağımlı işler dependsOn ile belirtilsin (denetçi/düzeltici kodlayıcılardan SONRA).",
    "- FAZLAMA (önemli): Projenin GERÇEK büyüklüğüne ve analizdeki kapsama göre karar ver.",
    "  • KÜÇÜK / tek-oturumda biten iş → HEPSİNE phase=1 (tek faz, gereksiz checkpoint yok).",
    "  • BÜYÜK iş → en fazla 2-3 faz. Faz 1 ÇALIŞAN bir iskelet üretmeli (boş doküman değil); 2: ana",
    "    özellikler; 3: cila. HER FAZDA birden çok paralel görev olsun. Az ama anlamlı faz.",
    "- Analizdeki 'Önerilen Yaklaşım' ve 'Kör Noktalar' bölümlerini görevlere/fazlara yansıt.",
    "- 3-8 görev. id'ler kısa ve benzersiz olsun.",
    analysis ? `\n=== OPERATÖR ANALİZİ (kararların temeli) ===\n${analysis}` : "",
    "",
    "Sohbet/istek:",
    formatHistory(history) || "(boş)",
    message ? `\nSon istek: ${message}` : ""
  ].filter(Boolean).join("\n");
}

function parsePlanTasks(output: string): Array<{ id: string; title: string; role?: string; folder?: string; dependsOn?: string[]; phase?: number }> {
  // JSON'u metin içinden ayıkla.
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { tasks?: any[] };
    if (!Array.isArray(parsed.tasks)) return [];
    const allowedRoles = new Set(["planner", "builder", "reviewer", "fixer"]);
    return parsed.tasks
      .filter((t) => t && typeof t.title === "string")
      .map((t, i) => ({
        id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `task${i + 1}`,
        title: String(t.title).trim(),
        role: allowedRoles.has(t.role) ? t.role : "builder",
        folder: typeof t.folder === "string" ? t.folder.replace(/[^a-z0-9._/-]/gi, "").slice(0, 60) : "",
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((d: any) => typeof d === "string") : [],
        phase: Number.isFinite(t.phase) && t.phase >= 1 ? Math.floor(t.phase) : 1
      }));
  } catch {
    return [];
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

// Kurulum komutu: PENCERESIZ (headless) çalışır, çıktısı yakalanır.
function installSpec(id: PlannerId): { command: string; args: string[]; label: string } {
  if (process.platform === "win32") {
    if (id === "claude") return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm install -g @anthropic-ai/claude-code"], label: "npm i -g @anthropic-ai/claude-code" };
    if (id === "codex") return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm install -g @openai/codex"], label: "npm i -g @openai/codex" };
    // antigravity (agy) — doğru komut: PowerShell irm | iex
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://antigravity.google/cli/install.ps1 | iex"],
      label: "irm https://antigravity.google/cli/install.ps1 | iex"
    };
  }
  if (id === "claude") return { command: "sh", args: ["-lc", "npm install -g @anthropic-ai/claude-code"], label: "npm i -g @anthropic-ai/claude-code" };
  if (id === "codex") return { command: "sh", args: ["-lc", "npm install -g @openai/codex"], label: "npm i -g @openai/codex" };
  return { command: "sh", args: ["-lc", "curl -fsSL https://antigravity.google/cli/install.sh | bash"], label: "curl antigravity install.sh" };
}

function runHidden(command: string, args: string[], timeoutMs: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Kurulum zaman aşımına uğradı (timeout)."));
    }, timeoutMs);
    child.stdout?.on("data", (d) => { out += d.toString(); if (out.length > 200_000) out = out.slice(-100_000); });
    child.stderr?.on("data", (d) => { out += d.toString(); if (out.length > 200_000) out = out.slice(-100_000); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, output: out }); });
  });
}

// Kurulumu bekleyerek yapar; bitince installed durumunu döndürür (anlık geri bildirim).
export async function installCli(id: PlannerId) {
  const spec = installSpec(id);
  try {
    const { output } = await runHidden(spec.command, spec.args, 8 * 60_000);
    const status = await statusFor(id).catch(() => null);
    const success = Boolean(status?.installed);
    return {
      ok: true,
      success,
      command: spec.label,
      message: success ? `${label(id)} kuruldu.` : `${label(id)} kurulamadı.`,
      error: success ? undefined : output.trim().slice(-600)
    };
  } catch (error) {
    return {
      ok: true,
      success: false,
      command: spec.label,
      message: `${label(id)} kurulamadı.`,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Kullanıcı yeniden giriş başlattığında önceki "Çıkış" (logout) bastırmasını kaldır.
// (Login artık /login-window üzerinden gittiği için startLoginCli çağrılmıyor; bu ayrıca lazım.)
export function clearLoginOverride(id: PlannerId) {
  loggedOutOverrides.delete(id);
  if (id === "claude") clearClaudeEnvironmentAuth();
}

export function startLoginCli(id: PlannerId) {
  loggedOutOverrides.delete(id);
  if (id === "claude") clearClaudeEnvironmentAuth();
  const command = loginCommand(id);
  if (process.platform === "win32") {
    if (id === "antigravity") {
      // `start ""` ile YENİ GÖRÜNÜR PowerShell penceresi aç (doğrudan spawn pencere açmıyordu).
      spawn("cmd.exe", ["/d", "/c", "start", "", "powershell.exe", "-NoExit", "-Command", "agy login"], {
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

// Cross-platform home directory (Linux/macOS uses HOME, Windows uses USERPROFILE).
function userHome(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? "";
}

function agyExecutablePath() {
  // Linux/macOS: check common install locations
  // - macOS: Homebrew on Apple Silicon (/opt/homebrew) and Intel (/usr/local), user bin
  // - Linux: ~/.local/bin, Linuxbrew, /usr/local/bin
  if (process.platform !== "win32") {
    const candidates = process.platform === "darwin"
      ? [
          join("/opt", "homebrew", "bin", "agy"),
          join("/usr", "local", "bin", "agy"),
          join(userHome(), ".local", "bin", "agy"),
          join(userHome(), "bin", "agy"),
        ]
      : [
          join(userHome(), ".local", "bin", "agy"),
          join("/home", "linuxbrew", ".linuxbrew", "bin", "agy"),
          join("/usr", "local", "bin", "agy"),
        ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }
  const agyExe = join(userHome(), "AppData", "Local", "agy", "bin", "agy.exe");
  return existsSync(agyExe) ? agyExe : undefined;
}

// Sadece auth durumunu loglardan okur (kurulu tespiti ayrı: agyInstalledByFile).
function getAgyLogStatus() {
  const logPath = join(userHome(), ".gemini", "antigravity-cli", "cli.log");
  if (!existsSync(logPath)) return { authenticated: false };
  try {
    const log = readFileSync(logPath, "utf8");
    // Auth başarı işareti. NOT: login sırasında token alınmadan önce log'a geçici
    // "You are not logged into Antigravity" handshake HATALARI düşüyor — bunlar logout
    // DEĞİL, o yüzden sayılmaz. UI üzerinden logout'u zaten loggedOutOverrides tutuyor.
    const authenticated = /OAuth:\s+authenticated successfully|authenticated via keyring|Auth done received|silent auth succeeded/i.test(log);
    return { authenticated };
  } catch {
    return { authenticated: false };
  }
}

// agy GERÇEKTEN kurulu mu? Bilinen dosya konumlarına bakar (PATH fallback değil).
function agyInstalledByFile(): boolean {
  if (agyExecutablePath()) return true;
  // Linux/macOS: also try resolving via `which` as last resort
  if (process.platform !== "win32") {
    try {
      const result = execFileSync("which", ["agy"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (result && existsSync(result)) return true;
    } catch { /* not in PATH */ }
    return false;
  }
  const agyBin = join(userHome(), "AppData", "Local", "agy", "bin");
  if (existsSync(agyBin)) return true;
  const npmDir = join(process.env.APPDATA ?? join(userHome(), "AppData", "Roaming"), "npm");
  if (existsSync(join(npmDir, "agy.cmd")) || existsSync(join(npmDir, "agy.exe"))) return true;
  return false;
}

// Tüm agy transcript.jsonl dosyalarını mtime'larıyla listeler.
function listAgyTranscripts(): { path: string; mtimeMs: number }[] {
  const brainDir = join(userHome(), ".gemini", "antigravity-cli", "brain");
  if (!existsSync(brainDir)) return [];
  try {
    return readdirSync(brainDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(brainDir, entry.name, ".system_generated", "logs", "transcript.jsonl"))
      .filter((path) => existsSync(path))
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }));
  } catch {
    return [];
  }
}

// Çalıştırma öncesi transcript mtime'larının anlık görüntüsü.
function snapshotAgyTranscripts(): Map<string, number> {
  return new Map(listAgyTranscripts().map((t) => [t.path, t.mtimeMs]));
}

// `before`'a göre YENİ ya da DEĞİŞEN transcript'i bulur, son MODEL içeriğini döndürür.
function readNewestAgyResponse(before: Map<string, number>): string | undefined {
  const changed = listAgyTranscripts()
    .filter((t) => {
      const prev = before.get(t.path);
      return prev === undefined || t.mtimeMs > prev;
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const t of changed) {
    const r = readLastModelContent(t.path);
    if (r) return r;
  }
  return undefined;
}

// Transcript'teki MODEL'in gerçek metin cevabını döndürür.
// Cevap `type:"PLANNER_RESPONSE"` (boş olmayan) entry'sindedir; GENERIC/RUN_COMMAND/VIEW_FILE/
// CODE_ACTION gibi araç tipleri "Created At: …" metadata içerir, onları atla. En SONdakini al.
function readLastModelContent(path: string): string | undefined {
  let lines: string[];
  try {
    lines = readFileSync(path, "utf8").trim().split(/\r?\n/).reverse();
  } catch {
    return undefined;
  }
  let fallback: string | undefined;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { source?: string; type?: string; content?: string };
      if (parsed.source !== "MODEL") continue;
      const content = parsed.content?.trim();
      if (!content) continue;
      if (parsed.type === "PLANNER_RESPONSE" && !/^Created At:/.test(content)) {
        return content; // gerçek model cevabı
      }
      // metadata değilse yedek olarak tut
      if (!fallback && !/^Created At:/.test(content)) fallback = content;
    } catch {
      // Ignore partial or non-JSON transcript lines.
    }
  }
  return fallback;
}

// agy sohbet/analiz çağrıları için boş, nötr bir çalışma dizini (repo'yu görmesin).
let neutralCwdCache: string | undefined;
function neutralAgyCwd() {
  if (neutralCwdCache && existsSync(neutralCwdCache)) return neutralCwdCache;
  const dir = join(tmpdir(), "orkestra-agy-neutral");
  try {
    mkdirSync(dir, { recursive: true });
    ensureAgyTrusted(dir); // nötr dizini de güvenilir yap (trust prompt'u atla)
    neutralCwdCache = dir;
    return dir;
  } catch {
    return undefined;
  }
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
    // agy `-p <prompt>` cevabı STDOUT'a değil bir transcript dosyasına yazar; bu yüzden
    // çıktıyı transcript'ten okuruz. Prompt agy.exe'ye doğrudan (cmd.exe'siz) argüman olarak
    // gider, çok satırlı/uzun (≤32K) güvenle taşınır. `-p`'yi argümansız bırakmak HATA verir.
    const args = model && model !== "default" ? ["--model", model, "-p", prompt] : ["-p", prompt];
    // Saat karşılaştırması yerine: çalıştırma ÖNCESİ transcript mtime'larını al; sonra
    // YENİ ya da DEĞİŞEN transcript'i bul. Deterministik (clock skew/pencere sorunu yok).
    const before = snapshotAgyTranscripts();
    // Sohbet/tartışma/analiz çağrıları NÖTR bir dizinde çalışır: agy repo dosyalarını görüp
    // prompt'u "ajan görevi" sanmasın (araç kullanımı/dosya keşfi → temiz metin cevabı vermez).
    return runTool("agy", args, "", plannerTimeoutMs, neutralAgyCwd())
      .then(async (output) => {
        const stdout = output.trim();
        if (stdout && !/Usage of agy|flag needs an argument|Available subcommands/i.test(stdout)) return stdout;
        const transcript = await waitForTranscript(() => readNewestAgyResponse(before), 25_000);
        return transcript || "Antigravity cevap üretemedi (transcript bulunamadı).";
      })
      .catch(async (error) => {
        const transcript = await waitForTranscript(() => readNewestAgyResponse(before), 25_000);
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

// Kullanıcının mesaj dilini tespit eder (EN/TR) — yanıtın AYNI dilde olması için.
export function detectLang(text: string): "en" | "tr" {
  const t = (text || "").toLowerCase();
  if (/[çğıİöşü]/i.test(text)) return "tr";
  if (/\b(ve|bir|için|bu|şu|ben|sen|yap|oluştur|merhaba|nasıl|değil|var|yok|lütfen|site|proje|kod|yaz|selam|teşekkür)\b/.test(t)) return "tr";
  return "en";
}
// Prompt'un EN BAŞINA konacak güçlü dil direktifi (Türkçe sistem-prompt'una rağmen baskın olsun).
function langDirective(text: string): string {
  return detectLang(text) === "tr"
    ? "ÖNEMLİ DİL KURALI: Yanıtının TAMAMINI Türkçe yaz."
    : "CRITICAL LANGUAGE RULE: Write your ENTIRE response in English. Do not use Turkish.";
}

async function buildClaudePrompt(message: string, history: ChatMessage[], detailLevel?: "low" | "medium" | "high", preHistory?: string) {
  const formattedHistory = preHistory ?? await formatHistoryWithDetail(history, detailLevel);
  return [
    langDirective(message),
    "Sen Orkestra'nın planlayıcı ajanısın; bu bir sohbet oturumudur, kod tabanına müdahale etme.",
    "Aşağıdaki konuşma geçmişini dikkate al — geçmişte senin dışında Gemini ve Codex gibi başka AI'lar da yanıt vermiş olabilir, onların söylediklerini de bağlam olarak kullan.",
    "cwd'deki proje dosyalarını veya hafızayı bağlam alma.",
    "Kullanıcı sohbet ederse kısa ve doğal yanıt ver.",
    "Kullanıcı bir uygulama, site, script, kod veya proje isterse uygulanabilir bir plan çıkar ve kod aşamasına geçilebileceğini söyle.",
    "ÖNEMLİ — belge istekleri: Kullanıcı bir metin/şiir/yazı/rapor için 'Word / PDF / .docx / doküman / dosya olarak ver/indir/oluştur' derse: SEN dosya oluşturamazsın ve buna GEREK YOK; 'iznim yok', 'dosya yazamıyorum', 'erişim kapalı' GİBİ ŞEYLER SÖYLEME, reddetme. İstenen içeriği DOĞRUDAN, düzgün biçimlendirilmiş MARKDOWN olarak yaz (başlık için #, paragraflar). Uygulama, yazdığın içeriği PDF/Word olarak indirmeyi otomatik olarak sunar.",
    "Yanıtını net ve aksiyon odaklı tut. ÖNEMLİ — DİL: Kullanıcı mesajını HANGİ dilde yazdıysa o dilde yanıtla (İngilizce→İngilizce, Türkçe→Türkçe). Kendi dilini dayatma; kullanıcının dilini aynala.",
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

async function callPlanner(id: PlannerId, message: string, history: ChatMessage[], model?: string, effort?: EffortLevel, detailLevel?: "low" | "medium" | "high", preHistory?: string) {
  const prompt = id === "claude" ? await buildClaudePrompt(message, history, detailLevel, preHistory) : await buildPlannerPrompt(message, history, detailLevel, preHistory);
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
  | { type: "analysis"; content: string; modelLabel: string }
  | { type: "analysis_pending"; modelLabel: string }
  | { type: "heartbeat" }
  | { type: "error"; planner: PlannerId; modelLabel: string; message: string }
  | { type: "done" };

export async function* runDebate(
  participants: Participant[],
  message: string,
  history: ChatMessage[],
  rounds: number,
  model?: string,
  effort?: EffortLevel,
  detailLevel?: "low" | "medium" | "high",
  skipClosing?: boolean
): AsyncGenerator<DebateEvent> {
  const active: Participant[] = [];
  for (const person of participants) {
    try {
      await assertPlannerReady(person.cli);
      active.push(person);
    } catch {
      // Limitli veya giris yapilmamis ajan tartismadan cikarilir.
    }
  }
  if (active.length < 2) {
    yield { type: "error", planner: active[0]?.cli ?? "claude", modelLabel: "Sistem", message: "Tartışma için en az iki doğrulanmış ajan gerekli." };
    yield { type: "done" };
    return;
  }

  const activeLabels = active.map((p) => participantLabel(p.cli, p.model));
  const turns: DebateTurn[] = [];
  const safeRounds = Math.min(3, Math.max(1, rounds));
  for (let round = 1; round <= safeRounds; round++) {
    // Bu turdaki tüm ajanlar PARALEL çalışır; cevabı BİTEN önce chat'e yazar (sabit sıra yok,
    // Claude hep ilk değil). Ajanlar bir önceki turun çıktısını görür; aynı tur içinde paralel.
    const snapshot = [...turns];
    type RoundResult =
      | { kind: "message"; person: Participant; label: string; content: string }
      | { kind: "error"; person: Participant; label: string; message: string };
    const tasks: Promise<RoundResult>[] = active.map((person, i) => {
      const speakerLabel = activeLabels[i];
      return (async (): Promise<RoundResult> => {
        const prompt = await buildDebatePromptWithDetail(speakerLabel, message, history, snapshot, round, safeRounds, activeLabels, detailLevel);
        try {
          const content = cleanPlannerOutput(await callPlannerRaw(person.cli, prompt, person.model ?? model, effort));
          return { kind: "message", person, label: speakerLabel, content };
        } catch (error) {
          return { kind: "error", person, label: speakerLabel, message: cleanPlannerOutput(error instanceof Error ? error.message : String(error)) };
        }
      })();
    });
    // Tamamlanma sırasına göre yield et.
    const wrapped = tasks.map((p, i) => p.then((r) => ({ i, r })));
    const pool = new Set(wrapped);
    while (pool.size) {
      const { i, r } = await Promise.race(pool);
      pool.delete(wrapped[i]);
      if (r.kind === "message") {
        turns.push({ planner: r.person.cli, modelLabel: r.label, content: r.content });
        yield { type: "message", planner: r.person.cli, modelLabel: r.label, content: r.content, round };
      } else {
        yield { type: "error", planner: r.person.cli, modelLabel: r.label, message: r.message };
      }
    }
  }

  // Operatör analizi artık STREAM'de yapılmaz (uzun sessizlik → bağlantı kopuyordu).
  // Code modunda frontend tartışma bitince ayrı /api/analyze çağırır (skipClosing=true).
  // Chat modunda burada sade bir karar özeti üretilir.
  if (turns.length && !skipClosing) {
    const summarizer = active[0];
    try {
      const summary = cleanPlannerOutput(await callPlannerRaw(summarizer.cli, buildDebateSummaryPrompt(message, turns), summarizer.model ?? model, effort));
      yield { type: "summary", content: summary };
    } catch {
      // Ozet basarisizsa sessiz gec; ham tartisma yine de kullanicida.
    }
  }
  yield { type: "done" };
}

// Operatör analizi — tartışma turlarından 5 bölümlü kartı üretir. STREAM'den BAĞIMSIZ:
// /api/analyze tarafından çağrılır (normal POST → JSON). Her zaman geçerli içerik döner.
export async function analyzeDebate(
  participants: Participant[],
  operator: Participant,
  message: string,
  turns: DebateTurn[],
  model?: string,
  effort?: EffortLevel,
  lang?: "en" | "tr"
): Promise<{ content: string; modelLabel: string }> {
  // Girdi dilini önceliklendir (kullanıcı ne yazdıysa o dilde analiz); yoksa geçilen dili kullan.
  const useLang: "en" | "tr" = detectLang(message) || lang || "tr";
  const analysisPrompt = buildOperatorAnalysisPrompt(message, turns, useLang);
  const isValid = (a: string) =>
    !!a && a.trim().length > 30 &&
    !/okunamad|yanıt vermedi|zaman aşımı|üretemedi|bulunamadı|Usage of agy|flag needs an argument|Available subcommands/i.test(a);

  const tryAnalyst = async (p: Participant): Promise<{ content: string; analyst: Participant } | null> => {
    try {
      const out = cleanPlannerOutput(await callPlannerRaw(p.cli, analysisPrompt, p.model ?? model, effort));
      return isValid(out) ? { content: out, analyst: p } : null;
    } catch {
      return null;
    }
  };

  // Operatör + ilk farklı CLI yedeğini PARALEL dene; İLK GEÇERLİ olanı al (en hızlısı kazanır →
  // operatör agy yavaşsa claude/codex paralel döner). Hepsi başarısızsa ya da 70sn aşılırsa fallback.
  const backup = participants.find((p) => p.cli !== operator.cli);
  const candidates = backup ? [operator, backup] : [operator];
  const fallback = { content: buildFallbackAnalysis(message, turns, useLang), analyst: operator };

  const winner = await new Promise<{ content: string; analyst: Participant }>((resolve) => {
    let pending = candidates.length;
    let settled = false;
    const finish = (r: { content: string; analyst: Participant }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    for (const p of candidates) {
      void tryAnalyst(p).then((r) => {
        if (r) finish(r);
        else if (--pending === 0) finish(fallback);
      });
    }
    setTimeout(() => finish(fallback), 70_000);
  });

  return { content: winner.content, modelLabel: participantLabel(winner.analyst.cli, winner.analyst.model) };
}

async function buildDebatePromptWithDetail(
  speakerLabel: string,
  message: string,
  history: ChatMessage[],
  turns: DebateTurn[],
  round: number,
  totalRounds: number,
  participantLabels: string[],
  detailLevel?: "low" | "medium" | "high"
): Promise<string> {
  const others = participantLabels.filter((p) => p !== speakerLabel).join(", ");
  
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
    langDirective(message),
    `Sen ${speakerLabel} olarak Orkestra'da bir KURUL TARTIŞMASInın katılımcısısın.`,
    `Diğer katılımcılar: ${others}. Tur ${round}/${totalRounds}.`,
    "Amaç birlikte en iyi kararı bulmak. Diğer ajanların söylediklerine DOĞRUDAN cevap ver: katıldığın/katılmadığın noktaları belirt, eksikleri tamamla, alternatif sun.",
    "Kısa ve öz konuş (en fazla birkaç paragraf), kendini tekrarlama, sadede gel. DİL: kullanıcının/görevin yazıldığı dilde konuş (İngilizce→İngilizce, Türkçe→Türkçe).",
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
    `Şimdi ${speakerLabel} olarak sıradaki katkını yap:`
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

// Operatör: tartışmayı 5 başlıklı yapılandırılmış analize çevirir (Code tartışma modu).
function buildOperatorAnalysisPrompt(message: string, turns: DebateTurn[], lang: "en" | "tr" = "tr") {
  const transcript = turns.map((turn) => `### ${turn.modelLabel}\n${turn.content}`).join("\n\n");
  if (lang === "en") {
    return [
      "You are the Orkestra OPERATOR. Below is a transcript where multiple AI models discussed a CODING task.",
      "Your job: analyze these views objectively and output EXACTLY these headings, as Markdown:",
      "",
      "## Shared View",
      "Points all models agree on (bullet points).",
      "## Points of Disagreement",
      "Where models conflict/differ; briefly note who says what.",
      "## Partial Consensus",
      "Points at least 2 models share but not all agree on.",
      "## Unique Ideas",
      "Valuable ideas raised by only a single model (name who).",
      "## Blind Spots",
      "Important risks/gaps NO model mentioned but matter for this task — YOU add these.",
      "",
      "End with a short '## Recommended Approach' giving the actionable final decision as bullet points.",
      "Write clearly, concretely, and IN ENGLISH. Do not start a new debate; only analyze.",
      "",
      `Coding task: ${message}`,
      "",
      "Debate transcript:",
      transcript
    ].join("\n");
  }
  return [
    "Sen Orkestra OPERATÖRÜsün. Aşağıda birden fazla AI modelinin bir KODLAMA görevini tartıştığı kayıt var.",
    "Görevin: bu görüşleri objektif analiz et ve TAM OLARAK şu 5 başlıkla, Markdown olarak ver:",
    "",
    "## Ortak Görüş",
    "Tüm modellerin hemfikir olduğu noktalar (madde madde).",
    "## Ayrıştığı Noktalar",
    "Modellerin çeliştiği/farklı düşündüğü noktalar; kim ne diyor kısaca belirt.",
    "## Kısmi Uzlaşı",
    "En az 2 modelin benzer düşündüğü ama tümünün katılmadığı noktalar.",
    "## Benzersiz Fikirler",
    "Yalnızca tek bir modelin öne sürdüğü değerli fikirler (kimden geldiğini yaz).",
    "## Kör Noktalar",
    "Hiçbir modelin değinmediği ama bu görev için ÖNEMLİ riskler/eksikler — bunu SEN ekle.",
    "",
    "Sonda kısa bir '## Önerilen Yaklaşım' ile uygulanabilir nihai kararı madde madde yaz.",
    "Net, somut ve Türkçe yaz. Yeni tartışma açma; sadece analiz et.",
    "",
    `Kodlama görevi: ${message}`,
    "",
    "Tartışma kaydı:",
    transcript
  ].join("\n");
}

// Operatör ve yedek ajan da analiz üretemezse: tartışma turlarından doğrudan yapısal
// bir analiz kartı kurar. Kart her zaman oluşmalı (kritik), boş bırakılmaz.
function buildFallbackAnalysis(message: string, turns: DebateTurn[], lang: "en" | "tr" = "tr") {
  const bySpeaker = turns.map((t) => {
    const text = t.content.replace(/\s+/g, " ").trim();
    return `- **${t.modelLabel}**: ${text.slice(0, 280)}${text.length > 280 ? "…" : ""}`;
  });
  if (lang === "en") {
    return [
      "## Shared View",
      "Automatic operator analysis could not be produced; participant views are compiled raw below.",
      "## Points of Disagreement",
      "(Compare the participant answers to assess.)",
      "## Unique Ideas",
      ...bySpeaker,
      "## Recommended Approach",
      `- Implement the "${message}" task by combining the common points of the views above.`,
      "- The operator/team can proceed based on this compilation."
    ].join("\n");
  }
  return [
    "## Ortak Görüş",
    "Otomatik operatör analizi üretilemedi; aşağıda katılımcı görüşleri ham olarak derlenmiştir.",
    "## Ayrıştığı Noktalar",
    "(Katılımcı yanıtlarını karşılaştırarak değerlendirin.)",
    "## Benzersiz Fikirler",
    ...bySpeaker,
    "## Önerilen Yaklaşım",
    `- "${message}" görevini, yukarıdaki görüşlerin ortak yönlerini birleştirerek uygulayın.`,
    "- Operatör/ekip bu derlemeyi temel alarak ilerleyebilir."
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
    const authPath = join(userHome(), ".codex", "auth.json");
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
    const authPath = join(userHome(), ".codex", "auth.json");
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
  // KURULU tespiti yalnızca gerçek agy dosya konumlarına dayanır. agy yoksa resolveTool
  // `cmd /c agy`'ye düşüyor; cmd başarıyla çalıştığı için "not recognized" hatası SADECE
  // çıktıda kalıyordu ve eskiden yanlışlıkla installed:true dönüyordu. Artık dosya yoksa
  // kurulu değildir.
  const installed = agyInstalledByFile();
  if (!installed) {
    return {
      id: "antigravity",
      name: "Antigravity CLI",
      installed: false,
      authenticated: false,
      quotaOk: true,
      responding: false,
      models: modelsFor("antigravity"),
      limits: defaultLimitPatterns(),
      lastError: "Kurulu değil."
    };
  }
  const agyLogStatus = getAgyLogStatus();
  const authenticated = !loggedOutOverrides.has("antigravity") && agyLogStatus.authenticated;
  return {
    id: "antigravity",
    name: "Antigravity CLI",
    installed: true,
    authenticated,
    quotaOk: true,
    responding: false,
    models: modelsFor("antigravity"),
    limits: defaultLimitPatterns(),
    lastError: authenticated ? undefined : "Giriş gerekli.",
    hint: authenticated
      ? "Antigravity OAuth oturumu logdan doğrulandı."
      : "Antigravity CLI kurulu; agy login gerekli."
  };
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

function runTool(command: string, args: string[], input: string, timeoutMs = plannerTimeoutMs, cwd?: string) {
  return new Promise<string>((resolve, reject) => {
    const resolved = resolveTool(command);
    const executable = resolved.executable;
    const finalArgs = [...resolved.prefixArgs, ...args];

    const child = execFile(executable, finalArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 5,
      env: envForTool(command),
      cwd
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
    const agyBin = join(userHome(), "AppData", "Local", "agy", "bin");
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
  // Best-effort: try each planner in order, fall through on failure.
  // Errors are logged at debug level so silent failures stay debuggable.
  for (const [name, get] of [
    ["claude", getClaudeStatus] as const,
    ["codex", getCodexStatus] as const,
    ["antigravity", getAntigravityStatus] as const,
  ]) {
    try {
      const s = await get();
      if (s.installed && s.authenticated) return name;
    } catch (err) {
      console.debug(`[planner] ${name} status check failed:`, err instanceof Error ? err.message : err);
    }
  }
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

function summarizePrompt(formattedHistory: string): string {
  return [
    "Sen Orkestra moderatörüsün. Aşağıdaki konuşma geçmişini çok kısa, net bir paragrafla Türkçe olarak özetle.",
    "Özette sadece konuşulan temel konuları ve varılan kararları belirt. Gereksiz detayları atla.",
    "",
    "Özetlenecek geçmiş:",
    formattedHistory,
    "",
    "Şimdi kısa özetini yaz:"
  ].join("\n");
}

// Artımlı/önbellekli bağlam: son N mesaj tam + eskiler özet. Cache verilirse SADECE yeni
// "düşen" mesajları özetler (tüm eskiyi yeniden özetleme). Özeti geri döndürür → istemci cache'ler.
export type ContextCache = { summary?: string; upto?: number };
async function buildContextWithCache(
  history: ChatMessage[],
  detailLevel?: "low" | "medium" | "high",
  cache?: ContextCache
): Promise<{ text: string; summary: string; upto: number }> {
  const level = detailLevel || "high";
  const threshold = level === "low" ? 2 : level === "medium" ? 4 : 12;
  if (history.length <= threshold) {
    return { text: formatRawHistory(history), summary: "", upto: 0 };
  }
  const windowStart = history.length - threshold;
  const recent = formatRawHistory(history.slice(windowStart));
  const cachedSummary = (cache?.summary ?? "").trim();
  const cachedUpto = cache?.upto ?? 0;
  let summary = cachedSummary;
  try {
    const summarizer = await getFirstReadyPlanner();
    if (summarizer) {
      if (cachedSummary && cachedUpto >= 0 && cachedUpto <= windowStart) {
        // Artımlı: yalnızca yeni düşen mesajları özetle, mevcut özete ekle (özetleme çağrısı küçülür).
        const delta = history.slice(cachedUpto, windowStart);
        if (delta.length) {
          const deltaSummary = cleanPlannerOutput(await callPlannerRaw(summarizer, summarizePrompt(formatRawHistory(delta))));
          summary = `${cachedSummary}\n${deltaSummary}`.trim();
        }
        // delta yoksa summary = cachedSummary → HİÇ özetleme çağrısı yok (tam tasarruf).
      } else {
        // Cache yok/geçersiz → tüm eskiyi bir kez özetle.
        summary = cleanPlannerOutput(await callPlannerRaw(summarizer, summarizePrompt(formatRawHistory(history.slice(0, windowStart)))));
      }
    }
  } catch (err) {
    console.error("buildContextWithCache: özetleme hatası, fallback:", err);
  }
  const text = summary
    ? `[Önceki Konuşma Özeti: ${summary}]\n\n${recent}`
    : `[Önceki konuşmalar özetlenemedi; son ${threshold} mesaj]\n\n${recent}`;
  return { text, summary, upto: windowStart };
}

async function buildPlannerPrompt(message: string, history: ChatMessage[], detailLevel?: "low" | "medium" | "high", preHistory?: string) {
  const formattedHistory = preHistory ?? await formatHistoryWithDetail(history, detailLevel);
  return [
    langDirective(message),
    "Sadece Orkestra chat gecmisini dikkate al; eski CLI/proje oturum baglamindan devam etme.",
    "Sen Orkestra'nın planlayıcı ajanısın. Geçmişte başka AI'lar (Claude, Gemini, Codex) da yanıt vermiş olabilir; onların mesajlarını da bağlam al.",
    "Kullanıcı sohbet ederse kısa ve doğal yanıt ver.",
    "Kullanıcı bir uygulama, site, script, kod veya proje isterse uygulanabilir bir plan çıkar ve kod aşamasına geçilebileceğini söyle.",
    "ÖNEMLİ — belge istekleri: Kullanıcı bir metin/şiir/yazı/rapor için 'Word / PDF / .docx / doküman / dosya olarak ver/indir/oluştur' derse: SEN dosya oluşturamazsın ve buna GEREK YOK; 'iznim yok', 'dosya yazamıyorum', 'erişim kapalı' GİBİ ŞEYLER SÖYLEME, reddetme. İstenen içeriği DOĞRUDAN, düzgün biçimlendirilmiş MARKDOWN olarak yaz (başlık için #, paragraflar). Uygulama, yazdığın içeriği PDF/Word olarak indirmeyi otomatik olarak sunar.",
    "Yanıtını net ve aksiyon odaklı tut. ÖNEMLİ — DİL: Kullanıcı mesajını HANGİ dilde yazdıysa o dilde yanıtla (İngilizce→İngilizce, Türkçe→Türkçe). Kendi dilini dayatma; kullanıcının dilini aynala.",
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
  if (id === "antigravity") return "Antigravity";
  return id;
}

function modelLabel(id: string) {
  if (id === "claude") return "Claude Code";
  if (id === "codex") return "OpenAI Codex";
  if (id === "antigravity") return "Antigravity CLI";
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

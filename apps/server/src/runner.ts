import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Agent, PlanTask, Run, RunEventType } from "../../../packages/shared/types";
import { interpolateArgs } from "./template";
import { GitService } from "./git";
import type { Store } from "./db";
import type { EventHub } from "./events";

// Ajan başına yürütme zaman aşımı (saniye). Gerçek kodlama görevleri 5 dk'yı kolayca aşar;
// varsayılan 30 dk. ORKESTRA_AGENT_TIMEOUT_SECONDS ile değiştirilebilir.
const AGENT_TIMEOUT_SECONDS = Math.max(60, Number(process.env.ORKESTRA_AGENT_TIMEOUT_SECONDS ?? 1800));

// agy çalışmadan ÖNCE workspace'i settings.json'daki trustedWorkspaces'e ekler →
// agy "Do you trust this folder?" sormadan headless çalışır (interaktif onay gerekmez).
export function ensureAgyTrusted(workspacePath: string) {
  try {
    const dir = join(process.env.USERPROFILE ?? "", ".gemini", "antigravity-cli");
    const file = join(dir, "settings.json");
    mkdirSync(dir, { recursive: true });
    let settings: Record<string, unknown> = {};
    if (existsSync(file)) {
      try { settings = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>; } catch { settings = {}; }
    }
    const list = Array.isArray(settings.trustedWorkspaces) ? (settings.trustedWorkspaces as string[]) : [];
    const norm = workspacePath.replace(/\//g, "\\");
    if (!list.some((p) => p.toLowerCase() === norm.toLowerCase())) {
      list.push(norm);
      settings.trustedWorkspaces = list;
      writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
    }
  } catch {
    // sessizce geç — trust yazılamazsa agy yine interaktif sorar
  }
}

const flowRoles = ["planner", "builder", "reviewer", "fixer"] as const;
const ignoredSnapshotDirs = new Set(["node_modules", ".git", "dist", ".next", ".cache", "__pycache__", ".turbo"]);
type FileSnapshot = Map<string, { size: number; mtimeMs: number; content?: string }>;
const maxDiffBytes = 512 * 1024;
const textExtensions = new Set([
  ".html", ".htm", ".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".sh", ".yml", ".yaml", ".xml", ".svg", ".vue", ".php"
]);

type RunControl = {
  notes: string[];
  stop: boolean;
  // TÜM aktif çocuk süreçler (paralel ajanlar). Durdurmada hepsi öldürülür.
  children: Set<ReturnType<typeof spawnCommand>>;
  resume?: () => void; // faz onayı: kullanıcı "devam et" deyince bir sonraki faza geçer
};

export class Runner {
  private controls = new Map<string, RunControl>();
  // GitHub token'ı (yalnızca bellekte). Ajanın git push/clone/fetch'i için süreç ortamına
  // GIT_CONFIG ile geçirilir → token diske YAZILMAZ. index.ts bağlan/kes'te günceller.
  githubToken: string | null = null;

  constructor(
    private store: Store,
    private hub: EventHub
  ) {}

  start(run: Run) {
    this.controls.set(run.id, { notes: [], stop: false, children: new Set() });
    void this.execute(run);
  }

  // Ekip modu: alt-görevleri bağımlılığa göre çalıştırır (bağımsızlar paralel).
  startTeam(run: Run, tasks: PlanTask[]) {
    this.controls.set(run.id, { notes: [], stop: false, children: new Set() });
    void this.executeTeam(run, tasks);
  }

  // Faz onayı: kullanıcı "devam et" dediğinde bir sonraki faz başlar.
  // Canlı bekleyen promise varsa onu serbest bırakır; yoksa (durduruldu/sunucu yeniden başladı)
  // diske kalıcı yazılan faz state'inden kaldığı yeri YENİDEN ayağa kaldırır.
  resumeRun(runId: string): boolean {
    const control = this.controls.get(runId);
    if (control?.resume) {
      const fn = control.resume;
      control.resume = undefined;
      fn();
      return true;
    }
    // Kalıcı state'ten devam (canlı bekleyen yoksa).
    const run = this.store.getRun(runId);
    if (!run) return false;
    const state = loadPhaseState(run.workspacePath);
    if (!state || state.nextPhaseIndex == null || state.nextPhaseIndex >= (state.tasks ? new Set(state.tasks.map((t) => t.phase ?? 1)).size : 0)) {
      return false;
    }
    this.controls.set(runId, { notes: [], stop: false, children: new Set() });
    this.store.updateRun(runId, { status: "running", activeStep: `resuming phase ${state.nextPhaseIndex + 1}`, completedAt: null });
    this.emit(runId, "started", `▶️ Faz ${state.nextPhaseIndex + 1} kaldığı yerden başlatılıyor.`);
    void this.runPhasesFrom(run, state.tasks, new Map(state.done ?? []), state.nextPhaseIndex);
    return true;
  }

  private async executeTeam(run: Run, tasks: PlanTask[]) {
    this.store.updateRun(run.id, { status: "running", activeStep: "team: planning" });
    const startMsg = tasks.length === 1 ? "Operatör projeyi yapıyor." : `Ekip çalışması başladı (${tasks.length} görev).`;
    this.emit(run.id, "started", startMsg);
    try {
      mkdirSync(run.workspacePath, { recursive: true });
      await GitService.ensureRepo(run.workspacePath); // proje kendi git deposu olsun (izolasyon)
      writeFileSync(join(run.workspacePath, "PROMPT.md"), run.prompt, "utf8");
      this.emit(run.id, "file_created", "PROMPT.md", null, JSON.stringify({ path: "PROMPT.md", adds: 0, dels: 0 }));
      await this.runPhasesFrom(run, tasks, new Map(), 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.updateRun(run.id, { status: "failed", activeStep: "failed", completedAt: new Date().toISOString(), summary: message });
      this.emit(run.id, "failed", message);
      this.controls.delete(run.id);
    }
  }

  // Fazları startIndex'ten itibaren çalıştırır. Her faz arası onay bekler ve ilerlemeyi
  // diske KALICI yazar (.orkestra-phase.json) → durdurma/yeniden başlatma sonrası resume edilebilir.
  private async runPhasesFrom(run: Run, tasks: PlanTask[], done: Map<string, string>, startIndex: number) {
    const control = this.controls.get(run.id);
    const clean = (s: string) => s.replace(/\s+/g, " ").trim();
    const phases = [...new Set(tasks.map((t) => t.phase ?? 1))].sort((a, b) => a - b);
    const multiPhase = phases.length > 1;

    try {
      for (let pi = startIndex; pi < phases.length; pi++) {
        const phaseNo = phases[pi];
        const phaseTasks = tasks.filter((t) => (t.phase ?? 1) === phaseNo);
        if (multiPhase) this.emit(run.id, "agent_step", `🚀 Faz ${phaseNo}/${phases.length} başlıyor (${phaseTasks.length} görev).`);

        const stopped = await this.executePhaseTasks(run, phaseTasks, done, control);
        if (stopped) {
          // Faz İÇİNDE durduruldu → bu faz yarım kalmış olabilir; resume'da BU fazı (pi) tekrar
          // çalıştır (ajanlar mevcut dosyaları görüp tamamlar). State korunur.
          savePhaseState(run.workspacePath, { tasks, done: [...done], nextPhaseIndex: pi });
          return;
        }

        const phaseLines = phaseTasks.map((t) => `• ${t.title}`).join("\n");
        const lastPhase = pi === phases.length - 1;

        if (multiPhase && !lastPhase) {
          // İlerlemeyi kalıcı yaz, sonra onay bekle.
          savePhaseState(run.workspacePath, { tasks, done: [...done], nextPhaseIndex: pi + 1 });
          const report = `✅ Faz ${phaseNo}/${phases.length} tamamlandı:\n${phaseLines}\n\nOnaylıyorsanız sıradaki faza devam edeyim mi?`;
          this.store.updateRun(run.id, { activeStep: `phase ${phaseNo} done — awaiting` });
          this.emit(run.id, "phase_done", report);
          await new Promise<void>((resolve) => {
            if (control) control.resume = resolve;
            else resolve();
          });
          if (control?.stop) {
            // Durdurma: state korunur (sonra "devam et" ile yine açılabilir). Run "stopped" işaretlenir.
            this.store.updateRun(run.id, { status: "failed", activeStep: "stopped", completedAt: new Date().toISOString(), summary: "Duraklatıldı — 'devam et' ile sürdürülebilir." });
            this.emit(run.id, "failed", "⏸️ Duraklatıldı. 'Sıradaki faza devam et' ile kaldığı yerden sürebilirsin.");
            this.controls.delete(run.id);
            return;
          }
        }
      }

      // Tüm fazlar bitti → tamamlandı, kalıcı state temizlenir.
      const transcript = tasks.map((t) => `## ${t.title} (${t.id})\n${done.get(t.id) ?? "(çalışmadı)"}`).join("\n\n");
      writeFileSync(join(run.workspacePath, "TRANSCRIPT.md"), transcript, "utf8");
      this.emit(run.id, "file_created", "TRANSCRIPT.md", null, JSON.stringify({ path: "TRANSCRIPT.md", adds: 0, dels: 0 }));
      clearPhaseState(run.workspacePath);

      let report: string;
      if (tasks.length === 1) {
        const out = clean(done.get(tasks[0].id) ?? "");
        report = out ? `✅ Operatör projeyi tamamladı.\n\n${out.slice(0, 700)}` : "✅ Operatör projeyi tamamladı.";
      } else {
        const lines = tasks.map((t) => `• ${t.title}`).join("\n");
        report = `✅ Ekip çalışması tamamlandı (${tasks.length} görev):\n${lines}\n\nOnaylıyorsanız yeni bir talimatla devam edebilirim.`;
      }
      this.store.updateRun(run.id, { status: "completed", activeStep: "completed", completedAt: new Date().toISOString(), summary: report });
      this.emit(run.id, "completed", report);
    } finally {
      this.controls.delete(run.id);
    }
  }

  // Bir fazın görevlerini bağımlılığa göre (bağımsızlar paralel) çalıştırır.
  // Durdurulduysa true döner.
  private async executePhaseTasks(run: Run, phaseTasks: PlanTask[], done: Map<string, string>, control?: RunControl): Promise<boolean> {
    const remaining = [...phaseTasks];
    const phaseIds = new Set(phaseTasks.map((t) => t.id));
    while (remaining.length) {
      if (control?.stop) {
        this.store.updateRun(run.id, { status: "failed", activeStep: "stopped", completedAt: new Date().toISOString(), summary: "Duraklatıldı — 'devam et' ile sürdürülebilir." });
        this.emit(run.id, "failed", "⏸️ Duraklatıldı. 'Sıradaki faza devam et' ile kaldığı yerden sürdürebilirsin.");
        this.controls.delete(run.id);
        return true;
      }
      // Bağımlılıkları (bu faz içinde) tamamlanmış görevler paralel koşar.
      const ready = remaining.filter((t) => (t.dependsOn ?? []).filter((d) => phaseIds.has(d)).every((d) => done.has(d)));
      if (!ready.length) {
        this.emit(run.id, "failed", "Çözülemeyen görev bağımlılığı (döngü?). Kalan görevler atlandı.");
        break;
      }
      this.store.updateRun(run.id, { activeStep: `team: ${ready.map((t) => t.id).join(", ")}` });
      const roles = new Set(ready.map((t) => t.role ?? "builder"));
      if (roles.has("reviewer")) this.emit(run.id, "agent_step", "🔍 Kodlama bitti — kod amaca uygunluk açısından denetleniyor…");
      else if (roles.has("fixer")) this.emit(run.id, "agent_step", "🔧 Tespit edilen sorunlar ayıklanıyor / düzeltiliyor…");
      else if (ready.length > 1) this.emit(run.id, "agent_step", `✍️ ${ready.length} görev paralel kodlanıyor…`);
      const results = await Promise.all(ready.map((task) => this.runTeamTask(run, task, done)));
      results.forEach((res, i) => done.set(ready[i].id, res));
      for (const task of ready) {
        const index = remaining.findIndex((t) => t.id === task.id);
        if (index >= 0) remaining.splice(index, 1);
      }
    }
    return false;
  }

  private async runTeamTask(run: Run, task: PlanTask, done: Map<string, string>): Promise<string> {
    const role = task.role ?? "builder";
    // Birincil ajan çözümü:
    // 1) task.agentId → konfigüre ajan
    // 2) task.cli → doğrudan oturum açılmış CLI'dan ad-hoc ajan (planlayıcısız ekip akışı)
    // 3) role → role uygun konfigüre ajan
    const primary =
      (task.agentId ? this.store.getAgent(task.agentId) : undefined) ??
      (task.cli ? adHocAgent(task.cli, task.model, role) : undefined) ??
      this.pickAgent(role) ??
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
    // Faz devamlılığı: önceki fazların/görevlerin ürettiği mevcut dosyaları prompt'a koy ki
    // ajan sıfırdan yazmasın, üzerine inşa etsin.
    const existingFiles = listWorkspaceFiles(run.workspacePath);
    const existingBlock = existingFiles.length
      ? [
          "",
          "Çalışma alanında ZATEN var olan dosyalar (önceki görevler/fazlar oluşturdu):",
          existingFiles.map((f) => `- ${f}`).join("\n"),
          "",
          "ÖNEMLİ: Bu dosyaları sıfırdan yeniden YAZMA. Önce ilgili olanları OKU; yalnızca görevini",
          "tamamlamak için gerekli ekleme/düzenlemeleri yap. Mevcut yapıyı, isimlendirmeyi ve stili koru."
        ].join("\n")
      : "";
    const promptText = [
      "Sen bir EKİP çalışmasında bir alt-görevi üstlendin.",
      `Görevin: ${task.title}`,
      folder ? `Bu görev için çalışma klasörü: ${folder} (dosyalarını buraya yaz).` : "",
      depContext ? `\nBağımlı olduğun önceki görevlerin çıktısı:\n${depContext}` : "",
      existingBlock,
      "",
      "Projenin genel amacı:",
      run.prompt,
      "",
      "Görevini somut olarak tamamla; gerekli dosyaları oluştur/düzenle. Çıktını kısa tut."
    ].filter(Boolean).join("\n");

    // Faz 5: birincil ajan + yedek zinciri. Limit/hata olursa yedeğe devret.
    // Dosyalar workspace'te kaldığı için yeni ajan kaldığı yerden devam eder.
    const chain = this.buildAgentChain(primary);
    const ctrl = this.controls.get(run.id);
    let lastError = "";
    for (let i = 0; i < chain.length; i++) {
      const agent = chain[i];
      // Durduruldu → yedek ajan başlatma, hemen çık.
      if (ctrl?.stop) return "(durduruldu)";
      // Güncel durum: bu ajan bu sırada limite takıldıysa atla.
      if (this.store.getAgent(agent.id)?.status === "limited") {
        this.emit(run.id, "limit_detected", `${agent.name} limitli, atlanıyor.`, agent.id);
        continue;
      }
      if (i > 0) {
        this.emit(run.id, "fallback_used", `${chain[0].name} başarısız/limitli → ${agent.name} devraldı.`, agent.id);
      }
      // Rol-bazlı, kullanıcının anlayacağı kısa durum: ne yapılıyor.
      const verb = role === "reviewer" ? "🔍 denetliyor" : role === "fixer" ? "🔧 düzeltiyor" : "✍️ kodluyor";
      this.emit(run.id, "agent_step", `${agent.name} ${verb}: ${task.title}`, agent.id);
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
    // Faz onayı bekliyorsa serbest bırak (durdurma kontrolüne düşsün).
    if (control.resume) { const r = control.resume; control.resume = undefined; r(); }
    // TÜM paralel ajan süreçlerini ANINDA öldür (sadece sonuncuyu değil).
    for (const child of control.children) killProcessTree(child);
    control.children.clear();
    this.emit(runId, "agent_step", "🛑 Durduruldu.", null);
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
      await GitService.ensureRepo(run.workspacePath); // proje kendi git deposu olsun (izolasyon)
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
    // GitHub bağlıysa: ajanın `git push/clone/fetch`'i github.com'a kimlikli gitsin diye
    // tek-seferlik HTTP header'ı GIT_CONFIG env ile geçir (token diske/.git/config'e yazılmaz).
    if (this.githubToken) {
      const basic = Buffer.from(`x-access-token:${this.githubToken}`, "utf8").toString("base64");
      cleanEnv.GIT_CONFIG_COUNT = "1";
      cleanEnv.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
      cleanEnv.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    }

    return new Promise<string>((resolve, reject) => {
      mkdirSync(cwd, { recursive: true });
      // agy ajanı: workspace'i önce güvenilir yap (trust prompt'unu atla).
      if (agent.command === "agy") ensureAgyTrusted(cwd);
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
      let promptText = opts?.promptText ?? buildAgentPrompt(run.prompt, agent, transcript, notes);
      // GitHub bağlıysa ajana bildir: git push/pull/clone github.com'a kimlikli çalışır.
      if (this.githubToken) {
        promptText += "\n\n[GitHub bağlı: git push/pull/fetch/clone github.com için kimlik doğrulamalı. 'origin' ayarlıysa istendiğinde `git push` yapabilirsin.]";
      }
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
      if (control) control.children.add(child);

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
        control?.children.delete(child);
        this.store.setAgentStatus(agent.id, "available");
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        clearInterval(fileWatch);
        control?.children.delete(child);
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

// Oturum açılmış bir CLI (claude | codex | agy) için, konfigüre ajan olmadan
// doğrudan çalıştırılabilen geçici (ad-hoc) ajan üretir. Model verilmişse flag olarak geçer.
// Prompt stdin'den verildiği için argsTemplate'e {prompt} koymaya gerek yok.
function adHocAgent(cli: string, model: string | undefined, role: string): Agent | undefined {
  const m = model && model !== "default" ? model : undefined;
  let command = "";
  let argsTemplate: string[] = [];
  // cli id'leri: "claude" | "codex" | "antigravity" (PlannerId/DebateParticipant).
  // antigravity'nin komutu "agy".
  if (cli === "claude") {
    command = "claude";
    argsTemplate = m ? ["--model", m, "-p", "--permission-mode", "acceptEdits"] : ["-p", "--permission-mode", "acceptEdits"];
  } else if (cli === "codex") {
    command = "codex";
    argsTemplate = m ? ["exec", "-m", m, "--dangerously-bypass-approvals-and-sandbox"] : ["exec", "--dangerously-bypass-approvals-and-sandbox"];
  } else if (cli === "antigravity" || cli === "agy" || cli === "gemini") {
    command = "agy";
    argsTemplate = m ? ["--model", m, "-p", "--dangerously-skip-permissions"] : ["-p", "--dangerously-skip-permissions"];
  } else {
    return undefined;
  }
  const labels: Record<string, string> = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", agy: "Antigravity", gemini: "Gemini" };
  return {
    id: `adhoc-${cli}-${m ?? "default"}`,
    name: `${labels[cli] ?? cli}${m ? ` · ${m}` : ""}`,
    role: (role as Agent["role"]) ?? "builder",
    command,
    argsTemplate,
    enabled: true,
    timeoutSeconds: AGENT_TIMEOUT_SECONDS,
    fallbackAgentIds: [],
    limitPatterns: ["limit", "quota", "rate_limit", "429", "exhausted"],
    status: "available",
    lastLimitedAt: null
  };
}

// Workspace'teki mevcut dosyaları (göreli yol) listeler — prompt'a "zaten var, üzerine inşa et"
// bağlamı vermek için. Faz devamlılığı: ajan önceki fazların ürettiklerini görür, sıfırdan yazmaz.
function listWorkspaceFiles(root: string, limit = 120): string[] {
  const out: string[] = [];
  const skip = new Set(["node_modules", ".git", "dist", "build", "PROMPT.md", "TRANSCRIPT.md", ".orkestra-phase.json"]);
  const walk = (dir: string, rel: string) => {
    if (out.length >= limit) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.name.startsWith(".") || skip.has(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), childRel);
      else out.push(childRel);
    }
  };
  walk(root, "");
  return out;
}

// ─── Kalıcı faz state (.orkestra-phase.json) — durdurma/yeniden başlatma sonrası resume için ───
type PhaseState = { tasks: PlanTask[]; done: [string, string][]; nextPhaseIndex: number };
function phaseStateFile(workspacePath: string) {
  return join(workspacePath, ".orkestra-phase.json");
}
function savePhaseState(workspacePath: string, state: PhaseState) {
  try {
    writeFileSync(phaseStateFile(workspacePath), JSON.stringify(state), "utf8");
  } catch {
    // yazılamazsa sessiz geç (resume canlı promise üzerinden yine çalışır)
  }
}
function loadPhaseState(workspacePath: string): PhaseState | null {
  try {
    return JSON.parse(readFileSync(phaseStateFile(workspacePath), "utf8")) as PhaseState;
  } catch {
    return null;
  }
}
function clearPhaseState(workspacePath: string) {
  try {
    unlinkSync(phaseStateFile(workspacePath));
  } catch {
    // yoksa sorun değil
  }
}

// Süreç AĞACINI öldürür. Windows'ta CLI shell (cmd.exe) altında torun süreç olduğundan
// child.kill() yetmez; taskkill /T ile tüm ağaç anında sonlandırılır.
function killProcessTree(child?: ReturnType<typeof spawnCommand>) {
  if (!child || child.pid == null) return;
  const pid = child.pid;
  try {
    if (process.platform === "win32") {
      execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {});
    } else {
      try { process.kill(-pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }
  } catch {
    try { child.kill(); } catch { /* zaten bitmiş olabilir */ }
  }
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

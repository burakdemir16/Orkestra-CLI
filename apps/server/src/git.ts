import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec as dugiteExec } from "dugite";
import type { GitStatus } from "../../../packages/shared/types";

// dugite gömülü git'i taşır → kullanıcının PC'sinde sistem git'i olmasa da çalışır.
// Çıktı string döner; non-zero exit'te REJECT etmez, exitCode ile bildirir.
const EXEC_OPTS = { maxBuffer: 1024 * 1024 * 50 } as const;

// Baz commit'ler için kimlik (depoda global ayar olmayabilir).
const IDENTITY = ["-c", "user.email=orkestra@local", "-c", "user.name=Orkestra"];

// Git'in boş ağaç hash'i — hiç commit yokken "her şeyi" diff'lemek için baz.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// İnceleme diff'inde gösterilmeyecek ağır/üretilen dizinler.
const EXCLUDED_DIRS = ["node_modules", "dist", "build", ".next", ".git", ".cache", "__pycache__", ".turbo", "vendor"];

// Diff hesaplama kilidi: `add -N`/`reset` index'i değiştirdiği için aynı anda iki collectDiff
// çalışırsa yarış olur (biri boş döner). Tüm çağrıları tek sıraya sokar.
let diffLock: Promise<unknown> = Promise.resolve();

export type DiffFile = { path: string; adds: number; dels: number; diff: string; binary: boolean };

const blockedPatterns = [
  /^\.env($|\.)/i,
  /(^|[\\/])\.env($|\.)/i,
  /token/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i
];

export class GitService {
  constructor(private cwd: string) {}

  async status(): Promise<GitStatus> {
    const branch = (await this.git(["branch", "--show-current"])).trim() || "unknown";
    const remote = (await this.git(["remote"])).trim();
    const porcelain = await this.git(["status", "--porcelain"]);
    const diffStat = await this.git(["diff", "--stat"]);

    return {
      branch,
      hasRemote: remote.length > 0,
      files: porcelain
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const status = line.slice(0, 2).trim();
          const path = line.slice(3).trim();
          const reason = blockedReason(path);
          return {
            path,
            status,
            blocked: Boolean(reason),
            reason
          };
        }),
      diffStat
    };
  }

  // Run başında çağrılır: workspace'i git deposu yap ve mevcut (run öncesi) durumu
  // baz commit'le. Böylece sonradan `git diff HEAD` yalnızca bu run'ın değişikliklerini gösterir.
  async commitBaseline() {
    if (!existsSync(join(this.cwd, ".git"))) {
      await this.git(["init"]);
    }
    await this.git(["add", "-A"]);
    // Bir şey yoksa bile HEAD oluşsun (ilk run boş workspace olabilir).
    await this.git([...IDENTITY, "commit", "-m", "orkestra baseline", "--allow-empty"]);
  }

  // Çalışma ağacının HEAD'e göre farkı (son baseline'dan beri) — tek diff çağrısı.
  async workingDiff(): Promise<DiffFile[]> {
    return this.collectDiff(null);
  }

  // TÜM turların birikmiş farkı: ilk baseline commit'ine (proje başlangıcı) göre.
  async workspaceDiff(): Promise<DiffFile[]> {
    const root = (await this.git(["rev-list", "--max-parents=0", "HEAD"])).split(/\r?\n/).filter(Boolean).pop();
    return this.collectDiff(root || EMPTY_TREE);
  }

  // Diff toplama (PERFORMANS): dosya başına ayrı `git diff` ÇAĞIRMAZ — numstat + TEK tam diff
  // alır, sonra metni dosya başına ayrıştırır. Ağır dizinler (node_modules vb.) hariç tutulur.
  // base=null → HEAD'e göre; base=<commit/tree> → ona göre.
  // SERİLEŞTİRİLİR: `add -N` + `reset` index'i değiştirir; iki çağrı çakışırsa biri diğerinin
  // intent-to-add'ini siler ve BOŞ döner. Global kilit ile aynı anda tek diff çalışır.
  private async collectDiff(base: string | null): Promise<DiffFile[]> {
    const run = diffLock.then(() => this.collectDiffUnlocked(base));
    diffLock = run.then(() => undefined, () => undefined);
    return run;
  }

  private async collectDiffUnlocked(base: string | null): Promise<DiffFile[]> {
    if (!existsSync(join(this.cwd, ".git"))) return [];
    const pathspec = ["--", ".", ...EXCLUDED_DIRS.map((d) => `:(exclude)${d}`), ...EXCLUDED_DIRS.map((d) => `:(exclude)${d}/**`)];
    // HIZ: `add -N` (intent-to-add) yalnızca YOLLARI kaydeder, dosya içeriğini HASH'LEMEZ →
    // OneDrive'da `add -A`'ya göre çok daha hızlı. Untracked dosyalar yine diff'e girer.
    await this.git(["add", "-N", ...pathspec]);
    const baseRef = base || "HEAD";
    const numstat = await this.git(["diff", baseRef, "--numstat", ...pathspec]);
    const full = await this.git(["diff", baseRef, ...pathspec]);
    await this.git(["reset", "-q"]);
    const diffByPath = splitUnifiedDiff(full);
    const files: DiffFile[] = [];
    for (const line of numstat.split(/\r?\n/).filter(Boolean)) {
      const cols = line.split("\t");
      const adds = cols[0];
      const dels = cols[1];
      const path = cols.slice(2).join("\t");
      if (!path || blockedReason(path)) continue;
      const binary = adds === "-" || dels === "-";
      files.push({
        path,
        adds: binary ? 0 : Number(adds) || 0,
        dels: binary ? 0 : Number(dels) || 0,
        diff: binary ? "" : (diffByPath.get(path) ?? ""),
        binary
      });
      if (files.length >= 500) break; // aşırı büyük diff'lerde tarayıcıyı boğma
    }
    return files;
  }

  // HIZLI değişiklik sayısı: stage ETMEDEN `git status` ile (İncele barı görünürlüğü için).
  // node_modules vb. hariç. Diff toplamaktan çok daha ucuz.
  async changedCount(): Promise<number> {
    if (!existsSync(join(this.cwd, ".git"))) return 0;
    const pathspec = ["--", ".", ...EXCLUDED_DIRS.map((d) => `:(exclude)${d}`), ...EXCLUDED_DIRS.map((d) => `:(exclude)${d}/**`)];
    const out = await this.git(["status", "--porcelain", "--untracked-files=all", ...pathspec]);
    return out.split(/\r?\n/).filter((l) => l.trim() && !blockedReason(l.slice(3).trim())).length;
  }

  async createBranch(branch: string) {
    await this.gitOrThrow(["checkout", "-b", branch]);
  }

  async commit(files: string[], message: string) {
    const safeFiles = files.filter((file) => !blockedReason(file));
    if (safeFiles.length === 0) throw new Error("No safe files selected for commit.");
    await this.gitOrThrow(["add", "--", ...safeFiles]);
    await this.gitOrThrow([...IDENTITY, "commit", "-m", message]);
  }

  // Mevcut HEAD'i origin'e push'lar. remoteUrl verilirse origin'i TEMİZ URL ile ayarlar
  // (token URL'ye gömülmez); kimlik doğrulama ephemeral http header ile yapılır → token
  // .git/config'e YAZILMAZ.
  async push(branch: string, opts?: { remoteUrl?: string; token?: string }) {
    if (opts?.remoteUrl) {
      const hasOrigin = (await this.git(["remote"])).split(/\r?\n/).includes("origin");
      await this.gitOrThrow(["remote", hasOrigin ? "set-url" : "add", "origin", opts.remoteUrl]);
    }
    await this.gitOrThrow([...authArgs(opts?.token), "push", "-u", "origin", branch]);
  }

  // Tüm değişiklikleri tek commit'le (GitHub'a ilk gönderim için pratik).
  async commitAll(message: string) {
    if (!existsSync(join(this.cwd, ".git"))) {
      await this.git(["init"]);
      await this.git(["checkout", "-b", "main"]);
    }
    await this.gitOrThrow(["add", "-A"]);
    // Değişiklik yoksa commit başarısız olur → yut.
    await this.git([...IDENTITY, "commit", "-m", message]);
  }

  async currentBranch(): Promise<string> {
    return (await this.git(["branch", "--show-current"])).trim() || "main";
  }

  // origin remote URL'si (yoksa boş string).
  async remoteUrl(): Promise<string> {
    return (await this.git(["remote", "get-url", "origin"])).trim();
  }

  // Klasörü KENDİ git deposu yap (yoksa) + .gitignore garanti et + yanlışlıkla izlenen ağır
  // dizinleri (node_modules vb. — preview'ın npm install'ı oluşturur) index'ten çıkar.
  // Böylece git bu dizinleri HİÇ taramaz → status/diff/add OneDrive'da bile hızlı olur.
  static async ensureRepo(dir: string) {
    if (!existsSync(join(dir, ".git"))) {
      const r = await dugiteExec(["init", "-b", "main"], dir, EXEC_OPTS);
      if (r.exitCode !== 0) await dugiteExec(["init"], dir, EXEC_OPTS); // eski git: -b yoksa
    }
    ensureGitignore(dir);
    // Daha önce baseline'a girmiş ağır dizinleri index'ten düşür (diske dokunmaz; --ignore-unmatch
    // ile izlenmiyorsa sessiz geçer). Bir kez gerçek iş yapar, sonra anlık.
    await dugiteExec(["rm", "-r", "--cached", "--ignore-unmatch", "--quiet", "--", ...EXCLUDED_DIRS], dir, EXEC_OPTS).catch(() => undefined);
  }

  // Bir GitHub deposunu hedef klasöre klonlar. URL TEMİZ kalır; token ephemeral header ile
  // geçer → klonlanan deponun origin'inde token saklanmaz.
  static async clone(url: string, targetDir: string, token?: string) {
    const r = await dugiteExec([...authArgs(token), "clone", url, targetDir], process.cwd(), EXEC_OPTS);
    if (r.exitCode !== 0) {
      throw new Error((r.stderr || "").toString().trim() || `git clone failed (${r.exitCode})`);
    }
  }

  // Okuma komutu: asla fırlatmaz, hata/non-zero'da boş string döner (eski .catch davranışı).
  private async git(args: string[]): Promise<string> {
    try {
      const r = await dugiteExec(args, this.cwd, EXEC_OPTS);
      if (r.exitCode !== 0) return "";
      return (r.stdout || "").toString();
    } catch {
      return "";
    }
  }

  // Değiştiren komut: non-zero exit'te stderr ile fırlatır.
  private async gitOrThrow(args: string[]): Promise<string> {
    const r = await dugiteExec(args, this.cwd, EXEC_OPTS);
    if (r.exitCode !== 0) {
      throw new Error((r.stderr || "").toString().trim() || `git ${args[0]} failed (${r.exitCode})`);
    }
    return (r.stdout || "").toString();
  }
}

// Workspace'te .gitignore garanti et (ağır/üretilen dizinler). Yoksa oluşturur; varsa eksik
// satırları ekler. Böylece git bu dizinleri taramaz → izole + hızlı.
function ensureGitignore(dir: string) {
  const file = join(dir, ".gitignore");
  const needed = EXCLUDED_DIRS.filter((d) => d !== ".git").map((d) => `${d}/`);
  try {
    let current = existsSync(file) ? readFileSync(file, "utf8") : "";
    const lines = new Set(current.split(/\r?\n/).map((l) => l.trim()));
    const missing = needed.filter((n) => !lines.has(n) && !lines.has(n.replace(/\/$/, "")));
    if (missing.length === 0 && current) return;
    if (current && !current.endsWith("\n")) current += "\n";
    if (!current) current = "# Orkestra: üretilen/ağır dizinler\n";
    writeFileSync(file, current + missing.join("\n") + "\n", "utf8");
  } catch {
    /* yoksay */
  }
}

// Tek `git diff` çıktısını dosya başına unified-diff metnine ayrıştırır (yüzlerce ayrı git
// çağrısı yerine tek çağrı → hız). Anahtar = "b/" tarafındaki dosya yolu.
function splitUnifiedDiff(full: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!full || !full.trim()) return map;
  const parts = full.split(/\r?\n(?=diff --git )/);
  for (const part of parts) {
    const header = part.startsWith("diff --git ") ? part : `diff --git ${part}`;
    const first = header.split(/\r?\n/, 1)[0]; // "diff --git a/path b/path"
    let path = "";
    const bm = first.match(/ b\/(.+)$/);
    if (bm) path = bm[1].trim();
    else {
      const pp = header.match(/^\+\+\+ b\/(.+)$/m);
      if (pp) path = pp[1].trim();
    }
    if (path) map.set(path, header);
  }
  return map;
}

// Token'ı .git/config'e yazmadan, tek seferlik HTTP header'ı ile kimlik doğrulama argümanları.
function authArgs(token?: string): string[] {
  if (!token) return [];
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return ["-c", `http.extraHeader=Authorization: Basic ${basic}`];
}

function blockedReason(path: string) {
  if (blockedPatterns.some((pattern) => pattern.test(path))) {
    return "Looks like a secret or environment file.";
  }
  return undefined;
}

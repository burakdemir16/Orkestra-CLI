import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { libsecretStore, LIBSECRET_PREFIX } from "./libsecret-token";

// GitHub erişimi — `gh` CLI'ye bağımlılık YOK. Her şey:
//   - kimlik: kullanıcının yapıştırdığı Personal Access Token (PAT)
//   - depolama: Windows DPAPI (kullanıcıya özel şifreli) → düz metin değil
//   - işlemler: GitHub REST API (repo/PR) + gömülü git (clone/push)
// ile yapılır. (Device Flow için ileride: client_id ekleyip token'ı buradan set etmek yeter.)

const API = "https://api.github.com";
const UA = "orkestra-app";

export interface GitHubUser {
  login: string;
  name?: string | null;
  avatarUrl?: string;
}

export interface CreatedRepo {
  fullName: string; // owner/repo
  owner: string;
  name: string;
  cloneUrl: string; // https://github.com/owner/repo.git
  htmlUrl: string;
  defaultBranch: string;
}

// PowerShell'i verilen env ile çalıştırıp stdout döndürür (token'ı arg yerine env'le geçeriz).
function runPwsh(script: string, env: Record<string, string>): Promise<{ out: string; code: number }> {
  return new Promise((res) => {
    const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, ...env }
    });
    let out = "";
    ps.stdout?.on("data", (d) => (out += d.toString()));
    ps.on("close", (code) => res({ out: out.trim(), code: code ?? 0 }));
    ps.on("error", () => res({ out: "", code: 1 }));
  });
}

// Orkestra OAuth App Client ID (PUBLIC — secret değil, dağıtılan herkes aynısını paylaşır).
// Dolu olduğundan kullanıcı hiçbir şey girmez; "GitHub ile Bağlan" doğrudan çalışır.
const BAKED_CLIENT_ID = "Ov23liM7UAR7FapwAWSi";

export class GitHubStore {
  private file: string;
  private cidFile: string;
  constructor(dataDir: string) {
    this.file = join(dataDir, "github-token.dat");
    this.cidFile = join(dataDir, "github-clientid.txt");
  }

  // OAuth App Client ID (önce gömülü sabit, yoksa kullanıcının girdiği).
  getClientId(): string {
    if (BAKED_CLIENT_ID) return BAKED_CLIENT_ID;
    try {
      return existsSync(this.cidFile) ? readFileSync(this.cidFile, "utf8").trim() : "";
    } catch {
      return "";
    }
  }

  setClientId(id: string): void {
    writeFileSync(this.cidFile, id.trim(), "utf8");
  }

  // Token'ı DPAPI (CurrentUser) ile şifreleyip diske yazar. Token komut satırında değil, env'de.
  // Linux: libsecret (secret-tool) tercih edilir; yoksa base64'e düşülür (makineye bağlı değil, ama az güvenli).
  async setToken(token: string): Promise<void> {
    if (process.platform === "linux") {
      const libsec = libsecretStore(this.file);
      if (libsec.available()) {
        await libsec.set(token);
        return;
      }
    }
    if (process.platform === "win32") {
      const { out, code } = await runPwsh(
        "$s=ConvertTo-SecureString -String $env:ORK_TOKEN -AsPlainText -Force; ConvertFrom-SecureString -SecureString $s",
        { ORK_TOKEN: token }
      );
      if (code === 0 && out) {
        writeFileSync(this.file, `dpapi:${out}`, "utf8");
        return;
      }
      // DPAPI başarısızsa base64'e düş (yine de düz metin değil, ama makineye bağlı değil).
    }
    writeFileSync(this.file, `b64:${Buffer.from(token, "utf8").toString("base64")}`, "utf8");
  }

  async getToken(): Promise<string | null> {
    if (!existsSync(this.file)) return null;
    const raw = readFileSync(this.file, "utf8").trim();
    if (raw.startsWith(LIBSECRET_PREFIX)) {
      if (process.platform !== "linux") return null;
      return libsecretStore(this.file).get();
    }
    if (raw.startsWith("dpapi:")) {
      const enc = raw.slice(6);
      if (process.platform !== "win32") return null;
      const { out, code } = await runPwsh(
        "$s=ConvertTo-SecureString -String $env:ORK_ENC; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)",
        { ORK_ENC: enc }
      );
      return code === 0 && out ? out : null;
    }
    if (raw.startsWith("b64:")) {
      try {
        return Buffer.from(raw.slice(4), "base64").toString("utf8");
      } catch {
        return null;
      }
    }
    return null;
  }

  clear(): void {
    // Linux: anahtar çekmecesindeki girişi de temizle.
    if (process.platform === "linux" && existsSync(this.file)) {
      const raw = readFileSync(this.file, "utf8").trim();
      if (raw.startsWith(LIBSECRET_PREFIX)) {
        void libsecretStore(this.file).clear();
      }
    }
    if (existsSync(this.file)) {
      try {
        unlinkSync(this.file);
      } catch {
        /* yoksay */
      }
    }
  }

  hasToken(): boolean {
    return existsSync(this.file);
  }
}

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });
}

async function ghError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string };
    return data.message || `GitHub API ${res.status}`;
  } catch {
    return `GitHub API ${res.status}`;
  }
}

// Token'ı doğrular ve kullanıcı bilgisini döndürür (geçersizse fırlatır).
export async function getUser(token: string): Promise<GitHubUser> {
  const res = await ghFetch(token, "/user");
  if (!res.ok) throw new Error(await ghError(res));
  const u = (await res.json()) as { login: string; name?: string | null; avatar_url?: string };
  return { login: u.login, name: u.name, avatarUrl: u.avatar_url };
}

// Yeni depo oluşturur (kullanıcı hesabı altında).
export async function createRepo(token: string, name: string, isPrivate: boolean, description?: string): Promise<CreatedRepo> {
  const res = await ghFetch(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({ name, private: isPrivate, description: description || undefined, auto_init: false })
  });
  if (!res.ok) throw new Error(await ghError(res));
  const r = (await res.json()) as {
    full_name: string;
    name: string;
    owner: { login: string };
    clone_url: string;
    html_url: string;
    default_branch?: string;
  };
  return {
    fullName: r.full_name,
    owner: r.owner.login,
    name: r.name,
    cloneUrl: r.clone_url,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch || "main"
  };
}

// Pull request açar; html_url döndürür.
export async function createPr(
  token: string,
  owner: string,
  repo: string,
  opts: { title: string; head: string; base: string; body?: string; draft?: boolean }
): Promise<{ htmlUrl: string; number: number }> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title: opts.title, head: opts.head, base: opts.base, body: opts.body || "", draft: opts.draft ?? false })
  });
  if (!res.ok) throw new Error(await ghError(res));
  const pr = (await res.json()) as { html_url: string; number: number };
  return { htmlUrl: pr.html_url, number: pr.number };
}

// ----- OAuth Device Flow (PAT'siz "Bağlan → tarayıcıda onayla") -----

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

// 1) Cihaz kodu iste: kullanıcıya gösterilecek user_code + onay sayfası URL'si.
export async function deviceStart(clientId: string, scope = "repo"): Promise<DeviceCode> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ client_id: clientId, scope })
  });
  const d = (await res.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || d.error || !d.device_code) throw new Error(d.error_description || d.error || `device/code ${res.status}`);
  return {
    deviceCode: d.device_code,
    userCode: d.user_code || "",
    verificationUri: d.verification_uri || "https://github.com/login/device",
    expiresIn: d.expires_in || 900,
    interval: d.interval || 5
  };
}

// 2) Token için yokla: kullanıcı onaylayana kadar pending döner.
export async function devicePoll(
  clientId: string,
  deviceCode: string
): Promise<{ token?: string; pending?: boolean; slowDown?: boolean; error?: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });
  const d = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (d.access_token) return { token: d.access_token };
  if (d.error === "authorization_pending") return { pending: true };
  if (d.error === "slow_down") return { slowDown: true };
  return { error: d.error_description || d.error || "unknown" };
}

// git remote URL'sinden owner/repo çıkarır (https veya ssh). Bulamazsa null.
export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

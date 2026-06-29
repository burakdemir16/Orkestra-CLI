import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

// Linux token storage via libsecret (secret-tool CLI).
// - set: writes to the user keyring (service=orkestra, account=github),
//        then writes a marker file so the reader knows where to look.
// - get: reads the same keyring entry via secret-tool lookup.
// - clear: removes the keyring entry.
//
// If secret-tool is not installed, `available()` returns false and the
// caller should fall back to a portable store (base64 in our case).

export const LIBSECRET_PREFIX = "libsecret:";
export const LIBSECRET_LABEL = "orkestra";
export const LIBSECRET_SERVICE = "orkestra";
export const LIBSECRET_ACCOUNT = "github";

export type Probe = (bin: string) => string | null;
export type RunResult = { stdout: string; stderr: string; code: number };
export type RunFn = (bin: string, args: string[], stdin?: string) => Promise<RunResult>;

const defaultProbe: Probe = (bin) => {
  try {
    const out = execFileSync("which", [bin], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out || null;
  } catch {
    return null;
  }
};

const defaultRun: RunFn = (bin, args, stdin) =>
  new Promise((resolveRun) => {
    const p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d) => (stdout += d.toString()));
    p.stderr?.on("data", (d) => (stderr += d.toString()));
    if (stdin) p.stdin?.end(stdin);
    p.on("close", (code) => resolveRun({ stdout, stderr, code: code ?? 0 }));
    p.on("error", (err) => resolveRun({ stdout, stderr: err.message, code: 1 }));
  });

export type LibsecretStore = {
  available(): boolean;
  set(token: string): Promise<void>;
  get(): Promise<string | null>;
  clear(): Promise<void>;
};

export function libsecretStore(
  file: string,
  probe: Probe = defaultProbe,
  run: RunFn = defaultRun
): LibsecretStore {
  const available = () => probe("secret-tool") !== null;
  return {
    available,
    async set(token: string) {
      if (!available()) throw new Error("secret-tool not installed");
      const r = await run(
        "secret-tool",
        ["store", `--label=${LIBSECRET_LABEL}`, "service", LIBSECRET_SERVICE, "account", LIBSECRET_ACCOUNT],
        token
      );
      if (r.code !== 0) throw new Error(`secret-tool store failed: ${r.stderr.trim()}`);
      // Marker file — body is empty; the real token lives in the keyring.
      writeFileSync(file, LIBSECRET_PREFIX, "utf8");
    },
    async get() {
      if (!available()) return null;
      const r = await run("secret-tool", ["lookup", "service", LIBSECRET_SERVICE, "account", LIBSECRET_ACCOUNT]);
      if (r.code !== 0) return null;
      const out = r.stdout.trim();
      return out || null;
    },
    async clear() {
      if (!available()) return;
      await run("secret-tool", ["clear", "service", LIBSECRET_SERVICE, "account", LIBSECRET_ACCOUNT]);
    },
  };
}

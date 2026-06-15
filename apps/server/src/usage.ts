import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliUsage, ModelOption, UsageWindow } from "../../../packages/shared/types";

// Limit/kullanim verisini DOGRUDAN saglayicinin canli usage API'sinden cekeriz
// (cligate gibi). Token'lar her CLI'nin kendi credential dosyasindan okunur:
//   Claude  -> ~/.claude/.credentials.json   (OAuth)   -> api.anthropic.com/api/oauth/usage
//   Codex   -> ~/.codex/auth.json            (OAuth)   -> chatgpt.com/backend-api/wham/usage
//   Gemini  -> sinirsiz tier (5s/haftalik penceresi yok)
// Sonuc 60 sn bellek cache'inde tutulur ki her cli-status yoklamasinda API'yi
// dovmemis olalim.
const claudeDir = join(homedir(), ".claude");
const codexDir = join(homedir(), ".codex");
const ttlMs = 60_000;

type CacheEntry = { at: number; value: CliUsage | undefined };
const usageCache = new Map<string, CacheEntry>();

function readJson<T>(path: string): T | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<any | undefined> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

function pct(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function unixToIso(seconds: unknown): string | undefined {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toISOString();
}

function makeUsage(windows: UsageWindow[], limitReached = false): CliUsage | undefined {
  if (!windows.length) return undefined;
  return {
    windows,
    limited: limitReached || windows.some((w) => w.usedPercent >= 100),
    fetchedAt: new Date().toISOString(),
    stale: false
  };
}

function claudeToken(): string | undefined {
  const cred = readJson<{ claudeAiOauth?: { accessToken?: string } }>(join(claudeDir, ".credentials.json"));
  return cred?.claudeAiOauth?.accessToken;
}

function codexAuth(): { token: string; account: string } | undefined {
  const auth = readJson<{ tokens?: { access_token?: string; account_id?: string } }>(join(codexDir, "auth.json"));
  const token = auth?.tokens?.access_token;
  const account = auth?.tokens?.account_id;
  if (!token || !account) return undefined;
  return { token, account };
}

async function fetchClaudeUsage(): Promise<CliUsage | undefined> {
  const token = claudeToken();
  if (!token) return undefined;
  const data = await fetchJson("https://api.anthropic.com/api/oauth/usage", {
    authorization: `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
    "anthropic-version": "2023-06-01"
  });
  if (!data) return undefined;
  const windows: UsageWindow[] = [];
  if (data.five_hour) {
    windows.push({ label: "5 saat", usedPercent: pct(data.five_hour.utilization), resetsAt: data.five_hour.resets_at });
  }
  if (data.seven_day) {
    windows.push({ label: "Haftalık", usedPercent: pct(data.seven_day.utilization), resetsAt: data.seven_day.resets_at });
  }
  return makeUsage(windows);
}

async function fetchCodexUsage(): Promise<CliUsage | undefined> {
  const auth = codexAuth();
  if (!auth) return undefined;
  const data = await fetchJson("https://chatgpt.com/backend-api/wham/usage", {
    authorization: `Bearer ${auth.token}`,
    "chatgpt-account-id": auth.account,
    "User-Agent": "codex_cli_rs/0.50.0",
    originator: "codex_cli_rs",
    Accept: "application/json"
  });
  const rate = data?.rate_limit;
  if (!rate) return undefined;
  const windows: UsageWindow[] = [];
  if (rate.primary_window) {
    windows.push({
      label: "5 saat",
      usedPercent: pct(rate.primary_window.used_percent),
      resetsAt: unixToIso(rate.primary_window.reset_at)
    });
  }
  if (rate.secondary_window) {
    windows.push({
      label: "Haftalık",
      usedPercent: pct(rate.secondary_window.used_percent),
      resetsAt: unixToIso(rate.secondary_window.reset_at)
    });
  }
  return makeUsage(windows, Boolean(rate.limit_reached));
}

export async function getUsageFor(id: "claude" | "codex" | "antigravity"): Promise<CliUsage | undefined> {
  if (id === "antigravity") return undefined; // sinirsiz tier; 5s/haftalik penceresi yok
  const cached = usageCache.get(id);
  if (cached && Date.now() - cached.at < ttlMs) return cached.value;
  const value = id === "claude" ? await fetchClaudeUsage() : await fetchCodexUsage();
  // Canli veri alinamazsa son bilinen degeri (varsa) stale isaretiyle koru.
  if (!value && cached?.value) {
    return { ...cached.value, stale: true };
  }
  usageCache.set(id, { at: Date.now(), value });
  return value;
}

const modelsTtlMs = 5 * 60_000;
const modelsCache = new Map<string, { at: number; value: ModelOption[] }>();

function getCodexModels(): ModelOption[] {
  const data = readJson<{ models?: any[] }>(join(codexDir, "models_cache.json"));
  const slugs: string[] = Array.isArray(data?.models)
    ? data!.models.map((m) => m?.slug).filter((s): s is string => typeof s === "string" && /^gpt-/i.test(s))
    : [];
  const list = slugs.length ? slugs : ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"];
  return list.map((id) => ({ id, label: id, limited: false }));
}

// Claude model listesini Anthropic'in canli /v1/models endpoint'inden ceker.
async function getClaudeModels(): Promise<ModelOption[]> {
  const token = claudeToken();
  if (token) {
    const data = await fetchJson("https://api.anthropic.com/v1/models?limit=30", {
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "anthropic-version": "2023-06-01"
    });
    const models: ModelOption[] = Array.isArray(data?.data)
      ? data.data
          .filter((m: any) => typeof m?.id === "string" && m.id.startsWith("claude-"))
          .map((m: any) => ({ id: String(m.id), label: String(m.display_name ?? m.id), limited: false }))
      : [];
    if (models.length) return models;
  }
  return [
    { id: "claude-opus-4-8", label: "Opus 4.8", limited: false },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", limited: false },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", limited: false }
  ];
}

// Antigravity model listesi IDE'nin Codeium backend'inde (DPAPI sifreli api_key +
// protobuf RPC) durdugundan canli cekilemiyor; IDE'de gorunen liste kuratorlu verilir.
function getAntigravityModels(): ModelOption[] {
  return [
    { id: "gemini-3.5-flash-low", label: "Gemini 3.5 Flash (Low)", limited: false },
    { id: "gemini-3.5-flash-medium", label: "Gemini 3.5 Flash (Medium)", limited: false },
    { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)", limited: false },
    { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)", limited: false },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)", limited: false },
    { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)", limited: false },
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)", limited: false }
  ];
}

async function getBaseModels(id: "claude" | "codex" | "antigravity"): Promise<ModelOption[]> {
  const cached = modelsCache.get(id);
  if (cached && Date.now() - cached.at < modelsTtlMs) return cached.value;
  const value = id === "claude" ? await getClaudeModels() : id === "codex" ? getCodexModels() : getAntigravityModels();
  modelsCache.set(id, { at: Date.now(), value });
  return value;
}

// Saglayicinin secilebilir model listesini uretir. Ilk secenek her zaman "default".
// Hesap seviyesinde limit dolduysa (Claude/Codex) tum modeller devre disi isaretlenir.
export async function getModelOptions(
  id: "claude" | "codex" | "antigravity",
  usage: CliUsage | undefined
): Promise<ModelOption[]> {
  const accountLimited = id !== "antigravity" && Boolean(usage?.limited);
  const resetsAt = usage?.windows.find((w) => w.usedPercent >= 100)?.resetsAt;
  const base = await getBaseModels(id);
  const models = base.map((m) => ({
    ...m,
    limited: m.limited || accountLimited,
    resetsAt: m.resetsAt ?? (accountLimited ? resetsAt : undefined)
  }));
  return [
    { id: "default", label: "default", limited: accountLimited, resetsAt: accountLimited ? resetsAt : undefined },
    ...models
  ];
}

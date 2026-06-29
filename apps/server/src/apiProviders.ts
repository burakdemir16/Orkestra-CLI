import type { Agent, AgentRole } from "../../../packages/shared/types";

export type ApiProviderKind =
  | "anthropic"
  | "azure"
  | "gemini"
  | "ollama"
  | "openai"
  | "openai-compatible";

export interface ApiProviderConfig {
  id: string;
  name: string;
  role: AgentRole;
  kind: ApiProviderKind;
  model: string;
  apiKey?: string;
  apiBase?: string;
  apiVersion?: string;
  deployment?: string;
  enabled: boolean;
  timeoutSeconds: number;
  maxTokens: number;
  temperature?: number;
  headers: Record<string, string>;
}

const providerDefaults: Record<string, { kind: ApiProviderKind; apiBase?: string; apiKeyEnv?: string }> = {
  anthropic: { kind: "anthropic", apiBase: "https://api.anthropic.com/v1", apiKeyEnv: "ANTHROPIC_API_KEY" },
  azure: { kind: "azure", apiKeyEnv: "AZURE_OPENAI_API_KEY" },
  cerebras: { kind: "openai-compatible", apiBase: "https://api.cerebras.ai/v1", apiKeyEnv: "CEREBRAS_API_KEY" },
  cohere: { kind: "openai-compatible", apiBase: "https://api.cohere.com/compatibility/v1", apiKeyEnv: "COHERE_API_KEY" },
  deepseek: { kind: "openai-compatible", apiBase: "https://api.deepseek.com/v1", apiKeyEnv: "DEEPSEEK_API_KEY" },
  fireworks: { kind: "openai-compatible", apiBase: "https://api.fireworks.ai/inference/v1", apiKeyEnv: "FIREWORKS_API_KEY" },
  gemini: { kind: "gemini", apiBase: "https://generativelanguage.googleapis.com/v1beta", apiKeyEnv: "GEMINI_API_KEY" },
  groq: { kind: "openai-compatible", apiBase: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY" },
  "huggingface-inference-endpoints": { kind: "openai-compatible", apiKeyEnv: "HUGGINGFACE_API_KEY" },
  "huggingface-inference-providers": { kind: "openai-compatible", apiBase: "https://router.huggingface.co/v1", apiKeyEnv: "HUGGINGFACE_API_KEY" },
  inception: { kind: "openai-compatible", apiBase: "https://api.inceptionlabs.ai/v1", apiKeyEnv: "INCEPTION_API_KEY" },
  lmstudio: { kind: "openai-compatible", apiBase: "http://localhost:1234/v1" },
  mistral: { kind: "openai-compatible", apiBase: "https://api.mistral.ai/v1", apiKeyEnv: "MISTRAL_API_KEY" },
  moonshot: { kind: "openai-compatible", apiBase: "https://api.moonshot.ai/v1", apiKeyEnv: "MOONSHOT_API_KEY" },
  novita: { kind: "openai-compatible", apiBase: "https://api.novita.ai/v3/openai", apiKeyEnv: "NOVITA_API_KEY" },
  ollama: { kind: "ollama", apiBase: "http://127.0.0.1:11434" },
  openai: { kind: "openai", apiBase: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  openrouter: { kind: "openai-compatible", apiBase: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
  sambanova: { kind: "openai-compatible", apiBase: "https://api.sambanova.ai/v1", apiKeyEnv: "SAMBANOVA_API_KEY" },
  siliconflow: { kind: "openai-compatible", apiBase: "https://api.siliconflow.cn/v1", apiKeyEnv: "SILICONFLOW_API_KEY" },
  tensorix: { kind: "openai-compatible", apiBase: "https://api.tensorix.ai/v1", apiKeyEnv: "TENSORIX_API_KEY" },
  together: { kind: "openai-compatible", apiBase: "https://api.together.xyz/v1", apiKeyEnv: "TOGETHER_API_KEY" },
  vertex: { kind: "openai-compatible" },
  xai: { kind: "openai-compatible", apiBase: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY" }
};

export function listKnownApiProviderIds() {
  return Object.keys(providerDefaults).sort();
}

export function loadApiProviderConfigs(env: NodeJS.ProcessEnv = process.env): ApiProviderConfig[] {
  const ids = splitList(env.ORKESTRA_API_PROVIDERS);
  return ids.map((rawId) => providerFromEnv(rawId, env)).filter((config): config is ApiProviderConfig => Boolean(config));
}

export function loadApiProviderAgents(env: NodeJS.ProcessEnv = process.env): Agent[] {
  return loadApiProviderConfigs(env).map((config) => ({
    id: `api-${config.id}`,
    name: config.name,
    role: config.role,
    command: `api:${config.id}`,
    argsTemplate: [],
    enabled: config.enabled,
    timeoutSeconds: config.timeoutSeconds,
    fallbackAgentIds: [],
    limitPatterns: ["rate limit", "quota", "429", "insufficient_quota", "billing"],
    status: "available" as const,
    lastLimitedAt: null
  }));
}

export async function runApiProvider(config: ApiProviderConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  if (config.kind === "anthropic") return runAnthropic(config, prompt, signal);
  if (config.kind === "gemini") return runGemini(config, prompt, signal);
  if (config.kind === "ollama") return runOllama(config, prompt, signal);
  return runOpenAiCompatible(config, prompt, signal);
}

export function getApiProviderConfig(id: string, env: NodeJS.ProcessEnv = process.env) {
  const cleanId = id.startsWith("api:") ? id.slice(4) : id.replace(/^api-/, "");
  return loadApiProviderConfigs(env).find((config) => config.id === cleanId);
}

function providerFromEnv(rawId: string, env: NodeJS.ProcessEnv): ApiProviderConfig | undefined {
  const id = slug(rawId);
  if (!id) return undefined;
  const prefix = `ORKESTRA_API_PROVIDER_${envKey(id)}_`;
  const providerName = (env[`${prefix}PROVIDER`] || id).toLowerCase();
  const defaults = providerDefaults[providerName] || providerDefaults["openai"];
  const kind = ((env[`${prefix}TYPE`] || defaults.kind) as ApiProviderKind).toLowerCase() as ApiProviderKind;
  const model = env[`${prefix}MODEL`];
  if (!model) return undefined;
  const role = parseRole(env[`${prefix}ROLE`]);
  const apiKey = env[`${prefix}API_KEY`] || (defaults.apiKeyEnv ? env[defaults.apiKeyEnv] : undefined);
  return {
    id,
    name: env[`${prefix}NAME`] || `${title(providerName)} · ${model}`,
    role,
    kind,
    model,
    apiKey,
    apiBase: trimSlash(env[`${prefix}API_BASE`] || defaults.apiBase),
    apiVersion: env[`${prefix}API_VERSION`],
    deployment: env[`${prefix}DEPLOYMENT`],
    enabled: env[`${prefix}ENABLED`] !== "0" && env[`${prefix}ENABLED`]?.toLowerCase() !== "false",
    timeoutSeconds: Math.max(10, Number(env[`${prefix}TIMEOUT_SECONDS`] || env.ORKESTRA_API_TIMEOUT_SECONDS || 120)),
    maxTokens: Math.max(1, Number(env[`${prefix}MAX_TOKENS`] || env.ORKESTRA_API_MAX_TOKENS || 4096)),
    temperature: env[`${prefix}TEMPERATURE`] === undefined ? undefined : Number(env[`${prefix}TEMPERATURE`]),
    headers: parseHeaders(env[`${prefix}HEADERS`])
  };
}

async function runOpenAiCompatible(config: ApiProviderConfig, prompt: string, signal?: AbortSignal) {
  if (!config.apiBase) throw new Error(`${config.name} needs API_BASE.`);
  if (config.kind !== "ollama" && !config.apiKey) throw new Error(`${config.name} needs an API key.`);
  const url = config.kind === "azure"
    ? `${trimSlash(config.apiBase)}/openai/deployments/${encodeURIComponent(config.deployment || config.model)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion || "2024-02-15-preview")}`
    : `${trimSlash(config.apiBase)}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json", ...config.headers };
  if (config.kind === "azure") headers["api-key"] = config.apiKey || "";
  else if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  const body = {
    model: config.kind === "azure" ? undefined : config.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: config.maxTokens,
    temperature: config.temperature
  };
  const json = await postJson(url, headers, body, signal);
  return json?.choices?.[0]?.message?.content?.trim() || json?.choices?.[0]?.text?.trim() || "";
}

async function runAnthropic(config: ApiProviderConfig, prompt: string, signal?: AbortSignal) {
  if (!config.apiKey) throw new Error(`${config.name} needs an API key.`);
  const json = await postJson(`${trimSlash(config.apiBase || providerDefaults.anthropic.apiBase)}/messages`, {
    "content-type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": "2023-06-01",
    ...config.headers
  }, {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [{ role: "user", content: prompt }]
  }, signal);
  return (json?.content || []).map((part: { type?: string; text?: string }) => part.type === "text" ? part.text || "" : "").join("").trim();
}

async function runGemini(config: ApiProviderConfig, prompt: string, signal?: AbortSignal) {
  if (!config.apiKey) throw new Error(`${config.name} needs an API key.`);
  const url = `${trimSlash(config.apiBase || providerDefaults.gemini.apiBase)}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const json = await postJson(url, { "content-type": "application/json", ...config.headers }, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: config.maxTokens, temperature: config.temperature }
  }, signal);
  return (json?.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part.text || "").join("").trim();
}

async function runOllama(config: ApiProviderConfig, prompt: string, signal?: AbortSignal) {
  const json = await postJson(`${trimSlash(config.apiBase || providerDefaults.ollama.apiBase)}/api/chat`, {
    "content-type": "application/json",
    ...config.headers
  }, {
    model: config.model,
    stream: false,
    messages: [{ role: "user", content: prompt }],
    options: { temperature: config.temperature }
  }, signal);
  return json?.message?.content?.trim() || "";
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const message = json?.error?.message || json?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return json;
}

function splitList(value?: string) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseRole(value?: string): AgentRole {
  const role = (value || "builder").toLowerCase();
  return role === "planner" || role === "reviewer" || role === "fixer" || role === "custom" ? role : "builder";
}

function parseHeaders(value?: string) {
  const headers: Record<string, string> = {};
  for (const item of splitList(value)) {
    const idx = item.indexOf(":");
    if (idx > 0) headers[item.slice(0, idx).trim()] = item.slice(idx + 1).trim();
  }
  return headers;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

function envKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function title(value: string) {
  return value.split(/[-_ ]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

function trimSlash(value?: string) {
  return value?.replace(/\/+$/g, "");
}

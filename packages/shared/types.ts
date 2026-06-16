export type AgentStatus = "available" | "running" | "limited" | "disabled";

export type AgentRole = "planner" | "builder" | "reviewer" | "fixer" | "custom";

export type RunStatus = "queued" | "running" | "completed" | "failed";

export type RunEventType =
  | "queued"
  | "started"
  | "stdout"
  | "stderr"
  | "completed"
  | "failed"
  | "agent_step"
  | "file_created"
  | "file_changed"
  | "file_deleted"
  | "limit_detected"
  | "fallback_used";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  command: string;
  argsTemplate: string[];
  enabled: boolean;
  timeoutSeconds: number;
  fallbackAgentIds: string[];
  limitPatterns: string[];
  status: AgentStatus;
  lastLimitedAt?: string | null;
}

export interface Run {
  id: string;
  prompt: string;
  status: RunStatus;
  workspacePath: string;
  createdAt: string;
  completedAt?: string | null;
  activeStep?: string | null;
  summary?: string | null;
}

export interface RunEvent {
  id: number;
  runId: string;
  agentId?: string | null;
  type: RunEventType;
  message: string;
  rawOutput?: string | null;
  createdAt: string;
}

export interface GitStatus {
  branch: string;
  hasRemote: boolean;
  files: Array<{
    path: string;
    status: string;
    blocked: boolean;
    reason?: string;
  }>;
  diffStat: string;
}

// Ekip planı: plancı projeyi alt-görevlere böler; orkestratör bağımlılığa göre
// (bağımsızları paralel) çalıştırır. Her görev bir ajana/role + opsiyonel klasöre atanır.
export interface PlanTask {
  id: string;
  title: string;
  agentId?: string; // belirli (konfigüre) ajan
  cli?: string; // doğrudan oturum açılmış CLI (claude | codex | agy) — agentId yoksa ad-hoc ajan kurulur
  model?: string; // CLI için model (varsa flag olarak geçer)
  role?: AgentRole; // agentId/cli yoksa rol üzerinden seçilir
  folder?: string; // alt-klasör (paralel görevlerin çakışmaması için)
  dependsOn?: string[]; // önce bitmesi gereken görev id'leri
}

export interface PlanResponse {
  tasks: PlanTask[];
  planner: string;
  modelLabel: string;
}

export interface CreateRunRequest {
  prompt: string;
  workspacePath?: string; // verilirse aynı proje workspace'inde devam edilir (sürekli geliştirme)
  tasks?: PlanTask[]; // verilirse ekip modu (orkestratör); yoksa doğrusal pipeline
}

export interface BriefRequest {
  history: ChatMessage[];
  message?: string;
  planner?: "claude" | "codex" | "antigravity" | "auto";
}

export interface BriefResponse {
  brief: string;
  planner: string;
  modelLabel: string;
}

export interface SaveAgentRequest {
  name: string;
  role: AgentRole;
  command: string;
  argsTemplate: string[];
  enabled: boolean;
  timeoutSeconds: number;
  fallbackAgentIds: string[];
  limitPatterns: string[];
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
  planner?: "claude" | "codex" | "antigravity" | "local" | "auto" | string;
  modelLabel?: string;
}

export type EffortLevel = "low" | "medium" | "high";

// Paralel/Tartisma katilimcisi: ayni CLI'den farkli modeller ayri katilimci olabilir.
export interface ChatParticipant {
  cli: "claude" | "codex" | "antigravity";
  model?: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  planner?: "claude" | "codex" | "antigravity" | "auto" | "all";
  model?: string;
  effort?: EffortLevel;
  participants?: ChatParticipant[]; // "all" (paralel) modunda CLI+model katilimcilari
  attachments?: string[]; // yuklenmis gorsel dosyalarinin mutlak yollari
  detailLevel?: "low" | "medium" | "high";
}

export interface UploadResponse {
  path: string;
  name: string;
}

export interface ChatResponse {
  message: ChatMessage;
  messages?: ChatMessage[];
  action: "none" | "suggest_pipeline";
  suggestedPrompt?: string;
  planner: string;
  modelLabel?: string;
  usedFallback: boolean;
  error?: string;
}

export interface UsageWindow {
  label: string;        // "5 saat" | "Haftalık"
  usedPercent: number;  // 0-100
  resetsAt?: string;    // ISO
}

export interface ModelOption {
  id: string;           // --model degeri
  label: string;        // gosterim adi
  limited: boolean;     // kotasi dolu mu
  resetsAt?: string;    // ISO
}

export interface CliUsage {
  windows: UsageWindow[]; // 5 saatlik + haftalik
  limited: boolean;       // herhangi bir pencere doldu mu
  fetchedAt?: string;     // ISO
  stale?: boolean;        // veri eski mi (cligate calismiyor)
}

export interface CliToolStatus {
  id: "claude" | "codex" | "antigravity";
  name: string;
  installed: boolean;
  authenticated: boolean;
  quotaOk: boolean;
  responding: boolean;
  models?: string[];
  modelOptions?: ModelOption[];
  usage?: CliUsage;
  limits?: string[];
  lastError?: string;
  hint?: string;
}

export interface CliStatusResponse {
  tools: CliToolStatus[];
  checkedAt: string;
}

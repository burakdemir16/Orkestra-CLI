import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bot,
  CheckCircle2,
  Circle,
  Diamond,
  GitBranch,
  ImagePlus,
  LogIn,
  LogOut,
  MessageCircle,
  Mic,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  X,
  Settings2,
  Sparkles,
  SquareTerminal,
  Sun,
  Zap
} from "lucide-react";
import type {
  Agent,
  AgentRole,
  ChatMessage,
  ChatResponse,
  CliStatusResponse,
  CliToolStatus,
  GitStatus,
  ModelOption,
  Run,
  RunEvent
} from "../../../packages/shared/types";
import "./styles.css";

type PlannerChoice = "auto" | "all" | "codex" | "claude" | "antigravity";
type StreamItem = {
  id: string;
  source: string;
  type: string;
  message: string;
  createdAt: string;
};

const plannerLabels: Record<PlannerChoice, string> = {
  auto: "Otomatik",
  all: "Tüm CLI'lar",
  codex: "OpenAI Codex",
  claude: "Claude Code",
  antigravity: "Gemini CLI"
};

const api = {
  async get<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  },
  async post<T>(url: string, body: unknown = {}): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
};

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  planner: "system",
  modelLabel: "Orkestra",
  content:
    "Merhaba! Ben Orkestra Planlayıcısı. Bir proje planlamak, sohbet etmek veya kod yazmak için bana yazabilirsiniz.",
  createdAt: new Date().toISOString()
};

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [chatInput, setChatInput] = useState("");
  const [attachments, setAttachments] = useState<{ path: string; name: string; preview: string }[]>([]);
  const [selectedPlanner, setSelectedPlanner] = useState<PlannerChoice>("codex");
  const [selectedModel, setSelectedModel] = useState("default");
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [cliStatus, setCliStatus] = useState<CliStatusResponse | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const online = Boolean(cliStatus);
  const agentOptions = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const verifiedTools = useMemo(
    () => cliStatus?.tools.filter((tool) => tool.authenticated && tool.quotaOk) ?? [],
    [cliStatus]
  );
  const plannerOptions = useMemo(() => {
    const options = verifiedTools.map((tool) => tool.id as PlannerChoice);
    if (verifiedTools.length > 1) options.push("all");
    return options;
  }, [verifiedTools]);
  const selectedTool = useMemo(
    () => cliStatus?.tools.find((tool) => tool.id === selectedPlanner),
    [cliStatus, selectedPlanner]
  );
  const modelOptions: ModelOption[] =
    selectedPlanner === "auto" || selectedPlanner === "all"
      ? [{ id: "default", label: "default", limited: false }]
      : selectedTool?.modelOptions?.length
        ? selectedTool.modelOptions
        : [{ id: "default", label: "default", limited: false }];

  useEffect(() => {
    setSelectedModel("default");
  }, [selectedPlanner]);

  // Secili model limitliyse veya listede yoksa default'a don.
  useEffect(() => {
    const current = modelOptions.find((m) => m.id === selectedModel);
    if (!current || current.limited) setSelectedModel("default");
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    if (!plannerOptions.length) return;
    if (!plannerOptions.includes(selectedPlanner)) {
      setSelectedPlanner(plannerOptions[0]);
    }
  }, [plannerOptions, selectedPlanner]);

  async function refresh() {
    const [nextAgents, nextRuns, nextGit, nextCli] = await Promise.all([
      api.get<Agent[]>("/api/agents"),
      api.get<Run[]>("/api/runs"),
      api.get<GitStatus>("/api/git/status").catch(() => null),
      api.get<CliStatusResponse>("/api/cli-status").catch(() => null)
    ]);
    setAgents(nextAgents);
    setRuns(nextRuns);
    setGitStatus(nextGit);
    setCliStatus(nextCli);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!activeRun) return;
    const source = new EventSource(`/api/runs/${activeRun.id}/events`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      setEvents((current) => {
        if (current.some((item) => item.id === event.id)) return current;
        return [...current, event];
      });
      setStreamItems((current) => [
        ...current,
        {
          id: `run-${event.id}`,
          source: event.agentId ?? "system",
          type: event.type,
          message: event.message,
          createdAt: event.createdAt
        }
      ]);
      if (event.type === "completed" || event.type === "failed") {
        void refresh();
      }
    };
    return () => source.close();
  }, [activeRun?.id]);

  async function addImage(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      const res = await api.post<{ path: string; name: string }>("/api/upload", { name: file.name, dataUrl });
      setAttachments((current) => [...current, { path: res.path, name: res.name, preview: dataUrl }]);
    } catch (error) {
      setNotice(`Görsel yüklenemedi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function removeImage(path: string) {
    setAttachments((current) => current.filter((item) => item.path !== path));
  }

  async function sendChat(overrideText?: string) {
    const content = (overrideText ?? chatInput).trim();
    const pending = attachments;
    if ((!content && !pending.length) || isThinking) return;
    setNotice(null);
    setSuggestedPrompt(null);
    setChatInput("");
    setAttachments([]);

    const messageToSend = content || "Ekli görseli incele.";
    const displayContent = pending.length
      ? `${content}${content ? "\n\n" : ""}📎 ${pending.map((item) => item.name).join(", ")}`
      : content;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
      createdAt: new Date().toISOString()
    };
    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
    setStreamItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        source: "Kullanıcı",
        type: "chat",
        message: displayContent,
        createdAt: new Date().toISOString()
      }
    ]);
    setIsThinking(true);

    try {
      const response = await api.post<ChatResponse>("/api/chat", {
        message: messageToSend,
        history: nextHistory,
        planner: selectedPlanner,
        model: selectedModel,
        attachments: pending.map((item) => item.path)
      });
      const responseMessages = response.messages?.length ? response.messages : [response.message];
      setMessages((current) => [...current, ...responseMessages]);
      setStreamItems((current) => [
        ...current,
        ...responseMessages.map((message) => ({
          id: crypto.randomUUID(),
          source: message.modelLabel ?? response.planner,
          type: response.usedFallback ? "fallback" : "assistant",
          message: message.content,
          createdAt: message.createdAt ?? new Date().toISOString()
        }))
      ]);
      if (response.action === "suggest_pipeline") setSuggestedPrompt(response.suggestedPrompt ?? content);
      if (response.error) {
        setNotice(`Fallback kullanıldı. ${response.error}`);
        setStreamItems((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            source: "Sistem",
            type: "hata",
            message: response.error ?? "",
            createdAt: new Date().toISOString()
          }
        ]);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          planner: "system",
          modelLabel: "Sistem",
          content: `Planlayıcı yanıt veremedi: ${text}`,
          createdAt: new Date().toISOString()
        }
      ]);
      setStreamItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source: "Sistem",
          type: "hata",
          message: text,
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function startRun(prompt: string) {
    const run = await api.post<Run>("/api/runs", { prompt });
    setActiveRun(run);
    setEvents([]);
    setSuggestedPrompt(null);
    await refresh();
  }

  async function openRun(run: Run) {
    const detail = await api.get<Run & { events: RunEvent[] }>(`/api/runs/${run.id}`);
    setActiveRun(detail);
    setEvents(detail.events);
  }

  async function runCliAction(tool: CliToolStatus, action: "login" | "logout" | "test") {
    setNotice(null);
    try {
      const result = await api.post<unknown>(`/api/cli/${tool.id}/${action}`);
      if (action === "test" || action === "logout") {
        setCliStatus((current) =>
          current
            ? { ...current, tools: current.tools.map((item) => (item.id === tool.id ? (result as CliToolStatus) : item)) }
            : current
        );
      } else {
        await refresh();
      }
      if (action === "login" && typeof result === "object" && result && "message" in result) {
        setNotice(String((result as { message: unknown }).message));
      } else {
        const updated = result as CliToolStatus;
        setNotice(`${displayToolName(tool.id)}: ${actionLabel(action)} tamamlandı. Durum: ${statusText(updated)}.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="brand">
          <strong>Orkestra</strong>
          <span>v2.0 Chat</span>
        </div>
        <div className="headerActions">
          <div className="languageSwitch">
            <button className="active">TR</button>
            <button>EN</button>
          </div>
          <div className={`connectionPill ${online ? "online" : "offline"}`}>
            <span />
            {online ? "Bağlı" : "Bağlı değil"}
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="leftColumn">
          <AgentCenter
            status={cliStatus}
            gitStatus={gitStatus}
            onRefresh={() => void refresh()}
            onAction={(tool, action) => void runCliAction(tool, action)}
          />
          <RolePanel agents={agentOptions} />
          <RunPanel runs={runs} activeRun={activeRun} onOpen={(run) => void openRun(run)} />
        </aside>

        <section className="centerColumn">
          <ChatPanel
            messages={messages}
            value={chatInput}
            selectedPlanner={selectedPlanner}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            plannerOptions={plannerOptions}
            thinking={isThinking}
            suggestedPrompt={suggestedPrompt}
            onPlannerChange={setSelectedPlanner}
            onModelChange={setSelectedModel}
            onChange={setChatInput}
            attachments={attachments}
            onAddImage={(file) => void addImage(file)}
            onRemoveImage={removeImage}
            onSend={(text) => void sendChat(text)}
            onClear={() => {
              setMessages([welcomeMessage]);
              setSuggestedPrompt(null);
              setAttachments([]);
            }}
            onStartPipeline={(prompt) => void startRun(prompt)}
            onDismissPipeline={() => setSuggestedPrompt(null)}
          />
          <StreamPanel items={streamItems} />
        </section>
      </section>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function AgentCenter({
  status,
  gitStatus,
  onRefresh,
  onAction
}: {
  status: CliStatusResponse | null;
  gitStatus: GitStatus | null;
  onRefresh: () => void;
  onAction: (tool: CliToolStatus, action: "login" | "logout" | "test") => void;
}) {
  const tools = status?.tools ?? [];
  return (
    <section className="glassPanel">
      <div className="panelTitle split">
        <span>
          <Zap size={17} />
          Ajan Merkezi
        </span>
        <button className="iconButton" onClick={onRefresh} title="Yenile">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="agentCards">
        {tools.map((tool) => (
          <article className="agentCard" key={tool.id}>
            <div className={`agentIcon ${tool.id}`}>{iconForTool(tool.id)}</div>
            <div className="agentInfo">
              <strong>{displayToolName(tool.id)}</strong>
              <span>{statusText(tool)}</span>
            {tool.lastError && <small>{tool.lastError}</small>}
              <UsageBars usage={tool.usage} />
              {tool.modelOptions?.length ? (
                <small>{tool.modelOptions.length} model • {tool.modelOptions.filter((m) => m.limited).length} limitli</small>
              ) : null}
            </div>
            <div className="agentActions">
              <button onClick={() => onAction(tool, "test")}>Test</button>
              {tool.authenticated ? (
                <button className="danger" onClick={() => onAction(tool, "logout")}>
                  Çıkış
                </button>
              ) : (
                <button className="login" onClick={() => onAction(tool, "login")}>
                  Giriş
                </button>
              )}
            </div>
          </article>
        ))}
        {!tools.length && <p className="muted">CLI durumu okunuyor...</p>}

        <article className="agentCard compact">
          <div className="agentIcon git">
            <GitBranch size={17} />
          </div>
          <div className="agentInfo">
            <strong>Git</strong>
            <span>{gitStatus ? "Hazır" : "Bekleniyor"}</span>
          </div>
          <div className="statusBadge ready">{gitStatus?.hasRemote ? "Remote" : "Yerel"}</div>
        </article>
      </div>
    </section>
  );
}

function RolePanel({ agents }: { agents: Agent[] }) {
  const roles: AgentRole[] = ["planner", "builder", "reviewer"];
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    setAssignments((current) => {
      const next = { ...current };
      for (const role of roles) {
        if (!next[role] || !agents.some((agent) => agent.id === next[role])) {
          next[role] = agents.find((agent) => agent.role === role)?.id ?? agents[0]?.id ?? "";
        }
      }
      return next;
    });
  }, [agents]);

  return (
    <section className="glassPanel">
      <div className="panelTitle">
        <Settings2 size={17} />
        <span>Roller</span>
      </div>
      {roles.map((role) => (
        <label className="roleSelect" key={role}>
          <span>{roleLabel(role)}</span>
          <select
            value={assignments[role] ?? ""}
            onChange={(event) => setAssignments((current) => ({ ...current, [role]: event.target.value }))}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {roleLabel(agent.role)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button className="resetButton">
        <RotateCcw size={14} />
        Sıfırla
      </button>
    </section>
  );
}

function RunPanel({
  runs,
  activeRun,
  onOpen
}: {
  runs: Run[];
  activeRun: Run | null;
  onOpen: (run: Run) => void;
}) {
  if (!runs.length) return null;
  return (
    <section className="glassPanel runPanel">
      <div className="panelTitle">
        <Circle size={15} />
        <span>Geçmiş</span>
      </div>
      <div className="runList">
        {runs.slice(0, 5).map((run) => (
          <button key={run.id} className={activeRun?.id === run.id ? "active" : ""} onClick={() => onOpen(run)}>
            <span>{run.prompt}</span>
            <small>{run.status}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChatPanel({
  messages,
  value,
  selectedPlanner,
  selectedModel,
  modelOptions,
  plannerOptions,
  thinking,
  suggestedPrompt,
  onPlannerChange,
  onModelChange,
  onChange,
  attachments,
  onAddImage,
  onRemoveImage,
  onSend,
  onClear,
  onStartPipeline,
  onDismissPipeline
}: {
  messages: ChatMessage[];
  value: string;
  selectedPlanner: PlannerChoice;
  selectedModel: string;
  modelOptions: ModelOption[];
  plannerOptions: PlannerChoice[];
  thinking: boolean;
  suggestedPrompt: string | null;
  onPlannerChange: (planner: PlannerChoice) => void;
  onModelChange: (model: string) => void;
  onChange: (value: string) => void;
  attachments: { path: string; name: string; preview: string }[];
  onAddImage: (file: File) => void;
  onRemoveImage: (path: string) => void;
  onSend: (text?: string) => void;
  onClear: () => void;
  onStartPipeline: (prompt: string) => void;
  onDismissPipeline: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const sendAfterRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSupported = typeof window !== "undefined" && Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

  function startVoice() {
    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Recognition || listening) return;
    const recognition = new Recognition();
    recognition.lang = "tr-TR";
    recognition.interimResults = true;
    recognition.continuous = true;
    transcriptRef.current = "";
    sendAfterRef.current = false;
    setLiveTranscript("");
    setRecordSeconds(0);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      transcriptRef.current = transcript;
      setLiveTranscript(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      if (timerRef.current) clearInterval(timerRef.current);
      const text = transcriptRef.current.trim();
      if (sendAfterRef.current) {
        const combined = value.trim() ? `${value.trim()} ${text}`.trim() : text;
        if (combined) onSend(combined);
      } else if (text) {
        onChange(value.trim() ? `${value.trim()} ${text}` : text);
      }
      setLiveTranscript("");
    };
    recognition.onerror = () => {
      setListening(false);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
    timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
  }

  function stopVoice(send: boolean) {
    sendAfterRef.current = send;
    if (!send) transcriptRef.current = "";
    recognitionRef.current?.stop();
  }

  const recordClock = `${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, suggestedPrompt]);

  return (
    <section className="chatPanel glassPanel">
      <div className="chatHeader">
        <div className="panelTitle">
          <MessageCircle size={18} />
          <span>Planlayıcı Sohbet</span>
          <strong>{plannerLabels[selectedPlanner]}</strong>
        </div>
        <div className="chatTools">
          <button onClick={onClear}>Temizle</button>
        </div>
      </div>

      <div className="chatMessages">
        {messages.map((message) => (
          <article key={message.id ?? `${message.role}-${message.createdAt}`} className={`chatBubble ${message.role}`}>
            {message.role === "assistant" && (
              <div className="messageMeta">
                <Bot size={14} />
                <span>{message.modelLabel ?? "Orkestra"}</span>
              </div>
            )}
            <pre>{message.content}</pre>
            {message.createdAt && <time>{new Date(message.createdAt).toLocaleTimeString("tr-TR")}</time>}
          </article>
        ))}
        {thinking && (
          <article className="chatBubble assistant thinking">
            <div className="messageMeta">
              <Sparkles size={14} />
              <span>{plannerLabels[selectedPlanner]} düşünüyor</span>
            </div>
            <div className="typingDots">
              <span />
              <span />
              <span />
            </div>
          </article>
        )}
        {suggestedPrompt && (
          <div className="pipelineCard">
            <div>
              <strong>Proje algılandı</strong>
              <p>{suggestedPrompt}</p>
            </div>
            <div className="pipelineActions">
              <button className="primary" onClick={() => onStartPipeline(suggestedPrompt)}>
                <Play size={16} />
                Kod Aşamasına Geç
              </button>
              <button onClick={onDismissPipeline}>Sohbete Devam</button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chatComposer">
        {attachments.length > 0 && (
          <div className="attachmentRow">
            {attachments.map((item) => (
              <div className="attachmentChip" key={item.path}>
                <img src={item.preview} alt={item.name} />
                <span>{item.name}</span>
                <button onClick={() => onRemoveImage(item.path)} title="Kaldır">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={value}
          placeholder="Mesaj yazın... (Ctrl+Enter gönder)"
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.items)
              .filter((item) => item.type.startsWith("image/"))
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file));
            if (images.length) {
              event.preventDefault();
              images.forEach((file) => onAddImage(file));
            }
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            Array.from(event.target.files ?? []).forEach((file) => onAddImage(file));
            event.target.value = "";
          }}
        />
        <div className="composerButtons">
          <button className="iconButton" onClick={() => fileInputRef.current?.click()} title="Görsel ekle">
            <ImagePlus size={18} />
          </button>
          {voiceSupported && (
            <button
              className={`iconButton${listening ? " recording" : ""}`}
              onClick={toggleVoice}
              title={listening ? "Dinlemeyi durdur" : "Sesle yaz"}
            >
              <Mic size={18} />
            </button>
          )}
          <button className="primary" disabled={(!value.trim() && !attachments.length) || thinking || !plannerOptions.length} onClick={onSend}>
            <Send size={16} />
            Gönder
          </button>
        </div>
        <div className="composerControls">
          <label>
            Hedef
            <select
              value={plannerOptions.includes(selectedPlanner) ? selectedPlanner : ""}
              disabled={!plannerOptions.length}
              onChange={(event) => onPlannerChange(event.target.value as PlannerChoice)}
            >
              {!plannerOptions.length && <option value="">Doğrulanmış CLI yok</option>}
              {plannerOptions.map((planner) => (
                <option key={planner} value={planner}>
                  {plannerLabels[planner]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id} disabled={model.limited}>
                  {model.label}
                  {model.limited ? ` — limitli${model.resetsAt ? ` (${resetLabel(model.resetsAt)})` : ""}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

function StreamPanel({ items }: { items: StreamItem[] }) {
  return (
    <section className="streamPanel">
      <div className="streamChrome">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
        <strong>orkestra-stream</strong>
        <button>Temizle</button>
      </div>
      <div className="streamTabs">
        <button className="active">Tüm</button>
        <button>Claude</button>
        <button>Codex</button>
        <button>AG</button>
        <button>Sistem</button>
      </div>
      <div className="streamBody">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className={item.type}>
              <span>{item.source}</span>
              <strong>{item.type}</strong>
              <pre>{item.message}</pre>
            </article>
          ))
        ) : (
          <p>Log bekleniyor...</p>
        )}
      </div>
    </section>
  );
}

function iconForTool(id: CliToolStatus["id"]) {
  if (id === "claude") return <Sun size={17} />;
  if (id === "codex") return <Diamond size={16} />;
  return <Sparkles size={17} />;
}

function displayToolName(id: CliToolStatus["id"]) {
  if (id === "claude") return "Claude Code";
  if (id === "codex") return "OpenAI Codex";
  return "Gemini CLI";
}

function statusText(tool: CliToolStatus) {
  if (!tool.installed) return "Kurulu değil";
  if (!tool.authenticated) return "Giriş gerekli";
  if (!tool.quotaOk) return "Kota sorunu";
  if (tool.responding) return "Yanıt veriyor";
  if (tool.id === "antigravity") return "Gemini dogrulandi";
  return "Doğrulandı";
}

function UsageBars({ usage }: { usage?: CliToolStatus["usage"] }) {
  if (!usage?.windows.length) return null;
  return (
    <div className="usageBars">
      {usage.windows.map((window) => (
        <div className="usageBar" key={window.label}>
          <div className="usageBarHead">
            <span>{window.label}</span>
            <span className={window.usedPercent >= 100 ? "usagePctFull" : ""}>%{window.usedPercent}</span>
          </div>
          <div className="usageTrack">
            <div
              className={`usageFill${window.usedPercent >= 90 ? " danger" : window.usedPercent >= 60 ? " warn" : ""}`}
              style={{ width: `${window.usedPercent}%` }}
            />
          </div>
          {window.resetsAt && <small className="usageReset">{resetLabel(window.resetsAt)} sıfırlanır</small>}
        </div>
      ))}
      {usage.stale && <small className="usageStale">⚠ veri eski — cligate güncellemesi bekleniyor</small>}
    </div>
  );
}

function resetLabel(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = t - Date.now();
  if (diffMs <= 0) return "şimdi";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} dk sonra`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa ${mins % 60} dk sonra`;
  const days = Math.floor(hours / 24);
  return `${days} gün ${hours % 24} sa sonra`;
}

function actionLabel(action: "login" | "logout" | "test") {
  if (action === "login") return "giriş";
  if (action === "logout") return "çıkış";
  return "test";
}

function roleLabel(role: AgentRole) {
  if (role === "planner") return "Planlayıcı";
  if (role === "builder") return "Kodlayıcı";
  if (role === "reviewer") return "Denetçi";
  if (role === "fixer") return "Düzeltici";
  return "Özel";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

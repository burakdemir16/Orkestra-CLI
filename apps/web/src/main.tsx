import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  Circle,
  Diamond,
  GitBranch,
  History,
  ImagePlus,
  LogIn,
  LogOut,
  MessageCircle,
  Mic,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Swords,
  Trash2,
  Users,
  X,
  Settings2,
  Sparkles,
  SquareTerminal,
  Sun,
  Moon,
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

type PlannerChoice = "auto" | "all" | "debate" | "codex" | "claude" | "antigravity";
type DebateParticipant = "claude" | "codex" | "antigravity";
type ChatMode = "single" | "multi" | "debate";
type Language = "en" | "tr";

const modeMeta: Record<ChatMode, { label: string; desc: string }> = {
  single: {
    label: "Single Agent",
    desc: "Only the selected CLI responds. Fastest and most economical mode for daily chat, simple questions, and small fixes."
  },
  multi: {
    label: "Multi Agent",
    desc: "The same message is sent to every verified CLI. Each responds independently and can see the shared history. Cost is roughly proportional to the number of CLIs."
  },
  debate: {
    label: "Debate",
    desc: "Selected agents answer each other in rounds, then Orkestra produces a decision summary. Best for major decisions and architecture. High token cost."
  }
};
type StreamItem = {
  id: string;
  source: string;
  type: string;
  message: string;
  createdAt: string;
};

const plannerLabels: Record<PlannerChoice, string> = {
  auto: "Automatic",
  all: "All CLIs (Parallel)",
  debate: "Debate Board",
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
    "Hello! I am the Orkestra Planner. You can ask me to plan a project, chat, or write code.",
  createdAt: new Date().toISOString()
};

type StoredConversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: string };
const CONVERSATIONS_KEY = "orkestra.conversations";

function loadConversations(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredConversation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(items: StoredConversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // localStorage may be full or unavailable; ignore silently.
  }
}

function deriveTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((message) => message.role === "user");
  const text = (firstUser?.content ?? "New chat").replace(/\s+/g, " ").trim();
  return text.length > 42 ? `${text.slice(0, 42)}...` : text || "New chat";
}

function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("orkestra.theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("orkestra.theme", theme);
  }, [theme]);

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("orkestra.language");
    return saved === "tr" ? "tr" : "en";
  });

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("orkestra.language", language);
  }, [language]);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [chatInput, setChatInput] = useState("");
  const [attachments, setAttachments] = useState<{ path: string; name: string; preview: string }[]>([]);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [selectedEffort, setSelectedEffort] = useState<"low" | "medium" | "high">("low");
  const [debateParticipants, setDebateParticipants] = useState<DebateParticipant[]>([]);
  const [debateRounds, setDebateRounds] = useState(1);
  const [chatHeight, setChatHeight] = useState<number>(() => {
    const saved = Number(localStorage.getItem("orkestra.chatHeight"));
    return Number.isFinite(saved) && saved >= 280 ? saved : 600;
  });
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const [mode, setMode] = useState<ChatMode>("single");
  const [singleCli, setSingleCli] = useState<DebateParticipant>("codex");
  const [selectedModel, setSelectedModel] = useState("default");
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [cliStatus, setCliStatus] = useState<CliStatusResponse | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [briefMeta, setBriefMeta] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const online = Boolean(cliStatus);
  const agentOptions = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const verifiedTools = useMemo(
    () => cliStatus?.tools.filter((tool) => tool.authenticated && tool.quotaOk) ?? [],
    [cliStatus]
  );
  // Tek ajan modunda seÃ§ilebilecek doÄŸrulanmÄ±ÅŸ CLI'lar.
  const cliOptions = useMemo(
    () => verifiedTools.map((tool) => tool.id as DebateParticipant),
    [verifiedTools]
  );
  const multiAvailable = verifiedTools.length > 1;

  // GÃ¶nderilecek planner moddan tÃ¼retilir.
  const selectedPlanner: PlannerChoice = mode === "multi" ? "all" : mode === "debate" ? "debate" : singleCli;

  // TartÄ±ÅŸma katÄ±lÄ±mcÄ±larÄ± varsayÄ±lan olarak tÃ¼m doÄŸrulanmÄ±ÅŸ CLI'lar.
  useEffect(() => {
    setDebateParticipants((current) => {
      const valid = verifiedTools.map((tool) => tool.id as DebateParticipant);
      const next = current.filter((id) => valid.includes(id));
      return next.length ? next : valid;
    });
  }, [verifiedTools]);

  // SeÃ§ili tek-ajan CLI'Ä± doÄŸrulanmÄ±ÅŸ deÄŸilse ilk geÃ§erliye dÃ¶n.
  useEffect(() => {
    if (cliOptions.length && !cliOptions.includes(singleCli)) setSingleCli(cliOptions[0]);
  }, [cliOptions, singleCli]);

  // Ã‡oklu/TartÄ±ÅŸma iÃ§in en az iki No CLIsa tek ajana dÃ¶n.
  useEffect(() => {
    if (mode !== "single" && !multiAvailable) setMode("single");
  }, [mode, multiAvailable]);

  const selectedTool = useMemo(
    () => cliStatus?.tools.find((tool) => tool.id === singleCli),
    [cliStatus, singleCli]
  );
  const modelOptions: ModelOption[] =
    mode !== "single"
      ? [{ id: "default", label: "default", limited: false }]
      : selectedTool?.modelOptions?.length
        ? selectedTool.modelOptions
        : [{ id: "default", label: "default", limited: false }];

  useEffect(() => {
    setSelectedModel("default");
  }, [singleCli, mode]);

  // Return to default if the selected model is limited or missing.
  useEffect(() => {
    const current = modelOptions.find((m) => m.id === selectedModel);
    if (!current || current.limited) setSelectedModel("default");
  }, [modelOptions, selectedModel]);

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
    setConversations(loadConversations());
  }, []);

  // Aktif sohbeti (en az bir kullanÄ±cÄ± mesajÄ± varsa) localStorage'a kaydet.
  useEffect(() => {
    if (!messages.some((message) => message.role === "user")) return;
    const convo: StoredConversation = {
      id: conversationId,
      title: deriveTitle(messages),
      messages,
      updatedAt: new Date().toISOString()
    };
    setConversations((current) => {
      const next = [convo, ...current.filter((item) => item.id !== conversationId)];
      saveConversations(next);
      return next;
    });
  }, [messages, conversationId]);

  function newChat() {
    setMessages([welcomeMessage]);
    setSuggestedPrompt(null);
    setAttachments([]);
    setNotice(null);
    setConversationId(crypto.randomUUID());
  }

  function openConversation(id: string) {
    const convo = conversations.find((item) => item.id === id);
    if (!convo) return;
    setMessages(convo.messages.length ? convo.messages : [welcomeMessage]);
    setConversationId(id);
    setSuggestedPrompt(null);
    setAttachments([]);
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const next = current.filter((item) => item.id !== id);
      saveConversations(next);
      return next;
    });
    if (id === conversationId) newChat();
  }

  useEffect(() => {
    localStorage.setItem("orkestra.chatHeight", String(chatHeight));
  }, [chatHeight]);

  function onResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = { startY: event.clientY, startH: chatHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const delta = event.clientY - resizeRef.current.startY;
    setChatHeight(Math.min(1000, Math.max(280, resizeRef.current.startH + delta)));
  }

  function onResizeEnd() {
    resizeRef.current = null;
  }

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
      setNotice(`GÃ¶rsel yÃ¼klenemedi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function removeImage(path: string) {
    setAttachments((current) => current.filter((item) => item.path !== path));
  }

  function appendDebateEvent(ev: {
    type: string;
    planner?: string;
    modelLabel?: string;
    content?: string;
    message?: string;
  }) {
    if (ev.type === "message" || ev.type === "summary") {
      const isSummary = ev.type === "summary";
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        planner: isSummary ? "system" : ev.planner,
        modelLabel: isSummary ? "Orkestra Â· Karar Ã–zeti" : ev.modelLabel,
        content: ev.content ?? "",
        createdAt: new Date().toISOString()
      };
      setMessages((current) => [...current, msg]);
      setStreamItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source: msg.modelLabel ?? "?",
          type: isSummary ? "summary" : "assistant",
          message: msg.content,
          createdAt: msg.createdAt ?? new Date().toISOString()
        }
      ]);
    } else if (ev.type === "error") {
      setNotice(`${ev.modelLabel ?? "System"}: ${ev.message ?? ""}`);
      setStreamItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source: ev.modelLabel ?? "System",
          type: "error",
          message: ev.message ?? "",
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  async function streamDebate(message: string, history: ChatMessage[]) {
    const res = await fetch("/api/debate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        participants: debateParticipants,
        rounds: debateRounds,
        effort: selectedEffort
      })
    });
    if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "TartÄ±ÅŸma baÅŸlatÄ±lamadÄ±."));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          appendDebateEvent(JSON.parse(line));
        } catch {
          // Ignore partial or invalid lines.
        }
      }
    }
  }

  async function sendChat(overrideText?: string) {
    const content = (overrideText ?? chatInput).trim();
    const pending = attachments;
    if ((!content && !pending.length) || isThinking) return;
    setNotice(null);
    setSuggestedPrompt(null);
    setChatInput("");
    setAttachments([]);

    const messageToSend = content || "Ekli gÃ¶rseli incele.";
    const displayContent = pending.length
      ? `${content}${content ? "\n\n" : ""}ğŸ“ ${pending.map((item) => item.name).join(", ")}`
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
        source: "KullanÄ±cÄ±",
        type: "chat",
        message: displayContent,
        createdAt: new Date().toISOString()
      }
    ]);
    setIsThinking(true);

    try {
      if (selectedPlanner === "debate") {
        await streamDebate(messageToSend, nextHistory);
        return;
      }
      const response = await api.post<ChatResponse>("/api/chat", {
        message: messageToSend,
        history: nextHistory,
        planner: selectedPlanner,
        model: selectedModel,
        effort: selectedPlanner === "claude" || selectedPlanner === "codex" ? selectedEffort : undefined,
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
        setNotice(`Fallback kullanÄ±ldÄ±. ${response.error}`);
        setStreamItems((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            source: "System",
            type: "error",
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
          modelLabel: "System",
          content: `PlanlayÄ±cÄ± yanÄ±t veremedi: ${text}`,
          createdAt: new Date().toISOString()
        }
      ]);
      setStreamItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source: "System",
          type: "error",
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

  // Sohbetten Code Task Brief Ã¼retip dÃ¼zenleme modalÄ±nÄ± aÃ§ar.
  async function createBrief() {
    setBriefOpen(true);
    setBriefLoading(true);
    setBriefMeta(null);
    try {
      const res = await api.post<{ brief: string; planner: string; modelLabel: string }>("/api/brief", {
        history: messages,
        planner: "auto"
      });
      setBriefText(res.brief);
      setBriefMeta(res.modelLabel);
    } catch (error) {
      setBriefText("");
      setNotice(`Brief Ã¼retilemedi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBriefLoading(false);
    }
  }

  function approveBrief() {
    const text = briefText.trim();
    if (!text) return;
    setBriefOpen(false);
    setSuggestedPrompt(null);
    void startRun(text);
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
        setNotice(`${displayToolName(tool.id)}: ${actionLabel(action)} tamamlandÄ±. Durum: ${statusText(updated)}.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="brand">
          <img src="/logo.png" alt="Orkestra Logo" className="logo" />
          <strong>Orkestra</strong>
          <span>v2.0 Chat</span>
        </div>
        <div className="headerActions">
          <button
            className="iconButton themeToggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title={theme === "light" ? "Koyu Temaya GeÃ§" : "AÃ§Ä±k Temaya GeÃ§"}
            style={{ width: "32px", height: "32px", padding: 0 }}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <div className="languageSwitch">
            <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            <button className={language === "tr" ? "active" : ""} onClick={() => setLanguage("tr")}>TR</button>
          </div>
          <div className={`connectionPill ${online ? "online" : "offline"}`}>
            <span />
            {online ? "BaÄŸlÄ±" : "BaÄŸlÄ± deÄŸil"}
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
        </aside>

        <section className="centerColumn">
          <div className="chatWrap" style={{ height: chatHeight }}>
          <ChatPanel
            messages={messages}
            value={chatInput}
            selectedPlanner={selectedPlanner}
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            selectedEffort={selectedEffort}
            onEffortChange={setSelectedEffort}
            participantOptions={verifiedTools.map((tool) => ({ id: tool.id as DebateParticipant, label: displayToolName(tool.id) }))}
            debateParticipants={debateParticipants}
            onToggleParticipant={(id) =>
              setDebateParticipants((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
              )
            }
            debateRounds={debateRounds}
            onRoundsChange={setDebateRounds}
            mode={mode}
            onModeChange={setMode}
            multiAvailable={multiAvailable}
            cliOptions={cliOptions}
            singleCli={singleCli}
            onSingleCliChange={setSingleCli}
            thinking={isThinking}
            suggestedPrompt={suggestedPrompt}
            onModelChange={setSelectedModel}
            onChange={setChatInput}
            attachments={attachments}
            onAddImage={(file) => void addImage(file)}
            onRemoveImage={removeImage}
            conversations={conversations}
            activeConversationId={conversationId}
            onNewChat={newChat}
            onOpenConversation={openConversation}
            onDeleteConversation={deleteConversation}
            onSend={(text) => void sendChat(text)}
            onClear={() => {
              setMessages([welcomeMessage]);
              setSuggestedPrompt(null);
              setAttachments([]);
            }}
            onCreateBrief={() => void createBrief()}
            onDismissPipeline={() => setSuggestedPrompt(null)}
          />
          </div>
          <div
            className="rowResizer"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            title="SÃ¼rÃ¼kleyerek yeniden boyutlandÄ±r"
          >
            <span />
          </div>
          <StreamPanel items={streamItems} onClear={() => setStreamItems([])} />
        </section>
      </section>

      {briefOpen && (
        <div className="briefOverlay" onMouseDown={() => setBriefOpen(false)}>
          <div className="briefDialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="briefHead">
              <strong>Code Task Brief</strong>
              <span className="briefMeta">{briefLoading ? "Ãœretiliyorâ€¦" : briefMeta ? `${briefMeta} Ã¼retti Â· dÃ¼zenleyebilirsin` : ""}</span>
              <button className="iconButton" onClick={() => setBriefOpen(false)} title="Kapat">
                <X size={16} />
              </button>
            </div>
            <textarea
              className="briefText"
              value={briefLoading ? "Brief Ã¼retiliyor, lÃ¼tfen bekleyinâ€¦" : briefText}
              readOnly={briefLoading}
              onChange={(event) => setBriefText(event.target.value)}
              placeholder="Brief burada gÃ¶rÃ¼necekâ€¦"
            />
            <div className="briefActions">
              <button onClick={() => void createBrief()} disabled={briefLoading}>
                <RefreshCw size={15} />
                Newden Ãœret
              </button>
              <div className="briefActionsRight">
                <button onClick={() => setBriefOpen(false)}>Ä°ptal</button>
                <button className="primary" onClick={approveBrief} disabled={briefLoading || !briefText.trim()}>
                  <Play size={15} />
                  Onayla ve Code'a Aktar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          Agent Center
        </span>
        <button className="iconButton" onClick={onRefresh} title="Refresh">
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
                <small>{tool.modelOptions.length} model â€¢ {tool.modelOptions.filter((m) => m.limited).length} limited</small>
              ) : null}
            </div>
            <div className="agentActions">
              <button onClick={() => onAction(tool, "test")}>Test</button>
              {tool.authenticated ? (
                <button className="danger" onClick={() => onAction(tool, "logout")}>
                  Ã‡Ä±kÄ±ÅŸ
                </button>
              ) : (
                <button className="login" onClick={() => onAction(tool, "login")}>
                  GiriÅŸ
                </button>
              )}
            </div>
          </article>
        ))}
        {!tools.length && <p className="muted">Reading CLI status...</p>}

        <article className="agentCard compact">
          <div className="agentIcon git">
            <svg fill="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ flex: "none", display: "block" }}>
              <path d="M23.384 11.41L12.59.616a1.686 1.686 0 00-2.388 0L8.03 2.79l2.766 2.766a1.71 1.71 0 011.848.367 1.724 1.724 0 01.425 1.712l2.775 2.775a1.724 1.724 0 011.712.425 1.71 1.71 0 01-.426 2.628c-.562.184-1.242.052-1.712-.418a1.72 1.72 0 01-.425-1.712l-2.775-2.775v5.153a1.712 1.712 0 11-1.077 0V9.33L8.344 6.3a1.724 1.724 0 01-1.21.346 1.712 1.712 0 01-1.212-.367L2.156 10.04a1.712 1.712 0 01.366 1.21 1.716 1.716 0 01-.366 1.215v5.152a1.712 1.712 0 11-1.078 0v-5.152a1.712 1.712 0 01.367-1.215l2.78-2.78a1.71 1.71 0 011.848-.367l2.784-2.784a1.686 1.686 0 00-2.388 0L.616 11.41a1.686 1.686 0 000 2.388l10.795 10.795a1.686 1.686 0 002.388 0l10.795-10.795a1.686 1.686 0 000-2.388z"/>
            </svg>
          </div>
          <div className="agentInfo">
            <strong>Git</strong>
            <span>{gitStatus ? "HazÄ±r" : "Waiting"}</span>
          </div>
          <div className="statusBadge ready">{gitStatus?.hasRemote ? "Remote" : "Local"}</div>
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
        <span>Roles</span>
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
                {agent.name} Â· {roleLabel(agent.role)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button className="resetButton">
        <RotateCcw size={14} />
        SÄ±fÄ±rla
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
        <span>GeÃ§miÅŸ</span>
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
  selectedEffort,
  onEffortChange,
  participantOptions,
  debateParticipants,
  onToggleParticipant,
  debateRounds,
  onRoundsChange,
  mode,
  onModeChange,
  multiAvailable,
  cliOptions,
  singleCli,
  onSingleCliChange,
  thinking,
  suggestedPrompt,
  onModelChange,
  onChange,
  attachments,
  onAddImage,
  onRemoveImage,
  conversations,
  activeConversationId,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
  onSend,
  onClear,
  onCreateBrief,
  onDismissPipeline
}: {
  messages: ChatMessage[];
  value: string;
  selectedPlanner: PlannerChoice;
  selectedModel: string;
  modelOptions: ModelOption[];
  selectedEffort: "low" | "medium" | "high";
  onEffortChange: (effort: "low" | "medium" | "high") => void;
  participantOptions: { id: DebateParticipant; label: string }[];
  debateParticipants: DebateParticipant[];
  onToggleParticipant: (id: DebateParticipant) => void;
  debateRounds: number;
  onRoundsChange: (rounds: number) => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  multiAvailable: boolean;
  cliOptions: DebateParticipant[];
  singleCli: DebateParticipant;
  onSingleCliChange: (id: DebateParticipant) => void;
  thinking: boolean;
  suggestedPrompt: string | null;
  onModelChange: (model: string) => void;
  onChange: (value: string) => void;
  attachments: { path: string; name: string; preview: string }[];
  onAddImage: (file: File) => void;
  onRemoveImage: (path: string) => void;
  conversations: StoredConversation[];
  activeConversationId: string;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSend: (text?: string) => void;
  onClear: () => void;
  onCreateBrief: () => void;
  onDismissPipeline: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyIndex, setHistoryIndex] = useState(0);

  const filteredConvos = conversations.filter((convo) =>
    convo.title.toLowerCase().includes(historyQuery.trim().toLowerCase())
  );
  const activeConvo = filteredConvos.find((convo) => convo.id === activeConversationId);
  const recentConvos = filteredConvos.filter((convo) => convo.id !== activeConversationId);
  const flatConvos = activeConvo ? [activeConvo, ...recentConvos] : recentConvos;

  function openHighlighted() {
    const target = flatConvos[Math.min(historyIndex, flatConvos.length - 1)];
    if (target) {
      onOpenConversation(target.id);
      setShowHistory(false);
    }
  }
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
          <span>PlanlayÄ±cÄ± Sohbet</span>
          <strong>{plannerLabels[selectedPlanner]}</strong>
        </div>
        <div className="chatTools">
          <button className="ghostButton" onClick={onNewChat} title="New chat">
            <Plus size={15} />
            New
          </button>
          <button
            className="ghostButton"
            onClick={() => {
              setHistoryQuery("");
              setShowHistory(true);
            }}
            title="GeÃ§miÅŸ sohbetler"
          >
            <History size={15} />
            GeÃ§miÅŸ
          </button>
          <button className="ghostButton" onClick={onClear} title="Clear chat">
            Clear
          </button>
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
              <span>{plannerLabels[selectedPlanner]} dÃ¼ÅŸÃ¼nÃ¼yor</span>
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
              <strong>Proje algÄ±landÄ±</strong>
              <p>Sohbeti yapÄ±landÄ±rÄ±lmÄ±ÅŸ bir gÃ¶reve (Code Task Brief) dÃ¶nÃ¼ÅŸtÃ¼rÃ¼p kod aÅŸamasÄ±na geÃ§ebilirsin.</p>
            </div>
            <div className="pipelineActions">
              <button className="primary" onClick={onCreateBrief}>
                <Play size={16} />
                Brief OluÅŸtur
              </button>
              <button onClick={onDismissPipeline}>Continue chat</button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="composerArea">
        <div className="modeSwitch">
          {(["single", "multi", "debate"] as ChatMode[]).map((item) => {
            const disabled = item !== "single" && !multiAvailable;
            return (
              <button
                key={item}
                className={`modeTab${mode === item ? " on" : ""}${item === "debate" ? " debate" : ""}`}
                disabled={disabled}
                onClick={() => onModeChange(item)}
              >
                {item === "single" && <Bot size={15} />}
                {item === "multi" && <Users size={15} />}
                {item === "debate" && <Swords size={15} />}
                {modeMeta[item].label} Mode
                <span className="modeTip">{disabled ? "En az iki doÄŸrulanmÄ±ÅŸ CLI gerekli." : modeMeta[item].desc}</span>
              </button>
            );
          })}
        </div>
        {mode === "debate" && (
          <div className="debateControls">
            <div className="partChips">
              {participantOptions.map((option) => (
                <button
                  key={option.id}
                  className={`partChip${debateParticipants.includes(option.id) ? " on" : ""}`}
                  onClick={() => onToggleParticipant(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="roundsPicker">
              Rounds
              <select value={debateRounds} onChange={(event) => onRoundsChange(Number(event.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>
        )}

      <div className={`composerBox${listening ? " recording" : ""}`}>
        {attachments.length > 0 && (
          <div className="attachmentRow">
            {attachments.map((item) => (
              <div className="attachmentChip" key={item.path}>
                <img src={item.preview} alt={item.name} />
                <span>{item.name}</span>
                <button onClick={() => onRemoveImage(item.path)} title="KaldÄ±r">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
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
        {listening ? (
          <div className="voiceBar">
            <span className="voiceClock">{recordClock}</span>
            <div className="voiceWave">
              {Array.from({ length: 28 }).map((_, index) => (
                <span key={index} style={{ animationDelay: `${(index % 7) * 0.09}s` }} />
              ))}
            </div>
            <span className="voiceText">{liveTranscript || "Listening..."}</span>
            <button className="iconRound voiceCancel" onClick={() => stopVoice(false)} title="Ä°ptal">
              <X size={17} />
            </button>
            <button className="iconRound sendCircle" onClick={() => stopVoice(true)} title="GÃ¶nder">
              <ArrowUp size={18} />
            </button>
          </div>
        ) : (
          <>
            <textarea
              className="composerInput"
              value={value}
              placeholder="Bir ÅŸey sorun veya gÃ¶rev verinâ€¦  (Enter gÃ¶nder Â· Shift+Enter yeni satÄ±r Â· Ctrl+V gÃ¶rsel yapÄ±ÅŸtÄ±r)"
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
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSend();
                }
              }}
            />
            <div className="composerBar">
              <div className="composerBarLeft">
                <button className="iconRound" onClick={() => fileInputRef.current?.click()} title="GÃ¶rsel ekle">
                  <Plus size={18} />
                </button>
                {mode === "single" && (
                  <select
                    className="pill"
                    value={cliOptions.includes(singleCli) ? singleCli : ""}
                    disabled={!cliOptions.length}
                    title="Which CLI"
                    onChange={(event) => onSingleCliChange(event.target.value as DebateParticipant)}
                  >
                    {!cliOptions.length && <option value="">No CLI</option>}
                    {cliOptions.map((id) => (
                      <option key={id} value={id}>
                        {plannerLabels[id]}
                      </option>
                    ))}
                  </select>
                )}
                {mode === "single" && (
                <select
                  className="pill"
                  value={selectedModel}
                  title="Model"
                  onChange={(event) => onModelChange(event.target.value)}
                >
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id} disabled={model.limited}>
                      {model.label}
                      {model.limited ? ` â€” limited${model.resetsAt ? ` (${resetLabel(model.resetsAt)})` : ""}` : ""}
                    </option>
                  ))}
                </select>
                )}
                {mode === "single" && (selectedPlanner === "claude" || selectedPlanner === "codex") && (
                  <select
                    className="pill"
                    value={selectedEffort}
                    title="Reasoning effort"
                    onChange={(event) => onEffortChange(event.target.value as "low" | "medium" | "high")}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                )}
              </div>
              <div className="composerBarRight">
                {voiceSupported && (
                  <button className="iconRound" onClick={startVoice} title="Voice input">
                    <Mic size={18} />
                  </button>
                )}
                <button
                  className="iconRound sendCircle"
                  disabled={(!value.trim() && !attachments.length) || thinking || !cliOptions.length}
                  onClick={() => onSend()}
                  title="GÃ¶nder"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      {showHistory && (
        <div className="historyOverlay" onMouseDown={() => setShowHistory(false)}>
          <div className="historyDialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="historySearch">
              <Search size={16} />
              <input
                autoFocus
                value={historyQuery}
                placeholder="Sohbetlerde araâ€¦"
                onChange={(event) => {
                  setHistoryQuery(event.target.value);
                  setHistoryIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setShowHistory(false);
                  else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHistoryIndex((index) => Math.min(index + 1, flatConvos.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHistoryIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    openHighlighted();
                  }
                }}
              />
            </div>
            <div className="historyList">
              {flatConvos.length === 0 && <div className="historyEmpty">EÅŸleÅŸen sohbet yok.</div>}
              {activeConvo && (
                <>
                  <div className="historyGroup">Åu anki</div>
                  <HistoryRow
                    convo={activeConvo}
                    highlighted={historyIndex === 0}
                    onOpen={() => {
                      onOpenConversation(activeConvo.id);
                      setShowHistory(false);
                    }}
                    onDelete={() => onDeleteConversation(activeConvo.id)}
                  />
                </>
              )}
              {recentConvos.length > 0 && <div className="historyGroup">Recent chats</div>}
              {recentConvos.map((convo, index) => {
                const flatIndex = activeConvo ? index + 1 : index;
                return (
                  <HistoryRow
                    key={convo.id}
                    convo={convo}
                    highlighted={historyIndex === flatIndex}
                    onOpen={() => {
                      onOpenConversation(convo.id);
                      setShowHistory(false);
                    }}
                    onDelete={() => onDeleteConversation(convo.id)}
                  />
                );
              })}
            </div>
            <div className="historyFooter">
              <span>â†‘â†“ gezin</span>
              <span>â†µ seÃ§</span>
              <span>Esc close</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function agoLabel(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "az Ã¶nce";
  if (mins < 60) return `${mins} dk Ã¶nce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa Ã¶nce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gÃ¼n Ã¶nce`;
  return `${Math.floor(days / 7)} hafta Ã¶nce`;
}

function HistoryRow({
  convo,
  highlighted,
  onOpen,
  onDelete
}: {
  convo: StoredConversation;
  highlighted: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`historyItem${highlighted ? " highlighted" : ""}`} onClick={onOpen}>
      <span className="historyItemTitle">{convo.title}</span>
      <span className="historyItemTime">{agoLabel(convo.updatedAt)}</span>
      <button
        className="historyItemDelete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ConversationsPanel({
  conversations,
  activeId,
  onOpen,
  onDelete,
  onNew
}: {
  conversations: StoredConversation[];
  activeId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="glassPanel">
      <div className="panelTitle split">
        <span>
          <History size={17} />
          GeÃ§miÅŸ Sohbetler
        </span>
        <button className="iconButton" onClick={onNew} title="New chat">
          <Plus size={15} />
        </button>
      </div>
      <div className="conversationList">
        {conversations.length === 0 && <small className="historyEmpty">HenÃ¼z kayÄ±tlÄ± sohbet yok.</small>}
        {conversations.map((convo) => (
          <div key={convo.id} className={`conversationItem${convo.id === activeId ? " active" : ""}`}>
            <button className="conversationOpen" onClick={() => onOpen(convo.id)}>
              <MessageCircle size={14} />
              <span>{convo.title}</span>
            </button>
            <button className="conversationDelete" onClick={() => onDelete(convo.id)} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function StreamPanel({ items, onClear }: { items: StreamItem[]; onClear: () => void }) {
  const [activeTab, setActiveTab] = useState<"all" | "claude" | "codex" | "ag" | "system">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const filteredItems = items.filter((item) => {
    const src = (item.source || "").toLowerCase();
    const isClaude = src.includes("claude");
    const isCodex = src.includes("codex");
    const isAg = src.includes("antigravity") || src.includes("gemini") || src.includes("agy");

    if (activeTab === "claude") return isClaude;
    if (activeTab === "codex") return isCodex;
    if (activeTab === "ag") return isAg;
    if (activeTab === "system") return !isClaude && !isCodex && !isAg;
    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const displayedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="streamPanel">
      <div className="streamChrome">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
        <strong>orkestra-stream</strong>
        <button onClick={onClear}>Clear</button>
      </div>
      <div className="streamTabs">
        <button
          className={activeTab === "all" ? "active" : ""}
          onClick={() => setActiveTab("all")}
        >
          TÃ¼m
        </button>
        <button
          className={activeTab === "claude" ? "active" : ""}
          onClick={() => setActiveTab("claude")}
        >
          Claude
        </button>
        <button
          className={activeTab === "codex" ? "active" : ""}
          onClick={() => setActiveTab("codex")}
        >
          Codex
        </button>
        <button
          className={activeTab === "ag" ? "active" : ""}
          onClick={() => setActiveTab("ag")}
        >
          AG
        </button>
        <button
          className={activeTab === "system" ? "active" : ""}
          onClick={() => setActiveTab("system")}
        >
          System
        </button>
      </div>
      <div className="streamBody">
        {displayedItems.length ? (
          displayedItems.map((item) => (
            <article key={item.id} className={item.type}>
              <span>{item.source}</span>
              <strong>{item.type}</strong>
              <pre>{item.message}</pre>
            </article>
          ))
        ) : (
          <p>Waiting for logs...</p>
        )}
      </div>
      {totalPages > 1 && (
        <div className="streamPagination">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Ã–nceki
          </button>
          <span>Page {currentPage} / {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function iconForTool(id: CliToolStatus["id"]) {
  if (id === "claude") {
    return (
      <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" width="18" height="18" style={{ flex: "none", display: "block" }}>
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
      </svg>
    );
  }
  if (id === "codex") {
    return (
      <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" width="18" height="18" style={{ flex: "none", display: "block" }}>
        <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
      </svg>
    );
  }
  if (id === "antigravity" || id === "gemini") {
    return (
      <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" width="18" height="18" style={{ flex: "none", display: "block" }}>
        <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" />
      </svg>
    );
  }
  return <Sparkles size={17} />;
}

function displayToolName(id: CliToolStatus["id"]) {
  if (id === "claude") return "Claude Code";
  if (id === "codex") return "OpenAI Codex";
  return "Gemini CLI";
}

function statusText(tool: CliToolStatus) {
  if (!tool.installed) return "Kurulu deÄŸil";
  if (!tool.authenticated) return "GiriÅŸ gerekli";
  if (!tool.quotaOk) return "Quota issue";
  if (tool.responding) return "YanÄ±t veriyor";
  if (tool.id === "antigravity") return "Gemini verified";
  return "DoÄŸrulandÄ±";
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
          {window.resetsAt && <small className="usageReset">{resetLabel(window.resetsAt)} sÄ±fÄ±rlanÄ±r</small>}
        </div>
      ))}
      {usage.stale && <small className="usageStale">âš  veri eski â€” cligate gÃ¼ncellemesi bekleniyor</small>}
    </div>
  );
}

function resetLabel(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = t - Date.now();
  if (diffMs <= 0) return "ÅŸimdi";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} min later`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa ${mins % 60} min later`;
  const days = Math.floor(hours / 24);
  return `${days} gÃ¼n ${hours % 24} h later`;
}

function actionLabel(action: "login" | "logout" | "test") {
  if (action === "login") return "giriÅŸ";
  if (action === "logout") return "Ã§Ä±kÄ±ÅŸ";
  return "test";
}

function roleLabel(role: AgentRole) {
  if (role === "planner") return "PlanlayÄ±cÄ±";
  if (role === "builder") return "KodlayÄ±cÄ±";
  if (role === "reviewer") return "DenetÃ§i";
  if (role === "fixer") return "DÃ¼zeltici";
  return "Ã–zel";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


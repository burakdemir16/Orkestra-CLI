import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  Bot,
  FileText,
  CheckCircle2,
  ChevronRight,
  Circle,
  Diamond,
  ExternalLink,
  Eye,
  File as FileIcon,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  History,
  ImagePlus,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquare,
  Code,
  Terminal,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Mic,
  PanelRightOpen,
  PanelRightClose,
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
  PlanTask,
  Run,
  RunEvent
} from "../../../packages/shared/types";
import "./styles.css";

type PlannerChoice = "auto" | "all" | "debate" | "codex" | "claude" | "antigravity";
type DebateParticipant = "claude" | "codex" | "antigravity";
type ChatMode = "single" | "multi" | "debate";
type Language = "en" | "tr";
type UiText = typeof uiText.en;
type StreamItem = {
  id: string;
  source: string;
  type: string;
  message: string;
  createdAt: string;
};

type TerminalSessionInfo = {
  id: string;
  shell: "powershell" | "cmd";
  name: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
};

type OpenFileTab = {
  path: string;
  name: string;
  content: string;
};

const plannerLabelsByLanguage: Record<Language, Record<PlannerChoice, string>> = {
  en: {
    auto: "Automatic",
    all: "All CLIs (Parallel)",
    debate: "Debate Board",
    codex: "OpenAI Codex",
    claude: "Claude Code",
    antigravity: "Gemini CLI"
  },
  tr: {
    auto: "Otomatik",
    all: "Tüm CLI'ler (Paralel)",
    debate: "Tartışma Panosu",
    codex: "OpenAI Codex",
    claude: "Claude Code",
    antigravity: "Gemini CLI"
  }
};

const modeMetaByLanguage: Record<Language, Record<ChatMode, { label: string; desc: string }>> = {
  en: {
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
  },
  tr: {
    single: {
      label: "Tek Ajan",
      desc: "Yalnızca seçili CLI cevap verir. Günlük sohbet, basit sorular ve küçük düzeltmeler için en hızlı ve en ekonomik mod."
    },
    multi: {
      label: "Çoklu Ajan",
      desc: "Aynı mesaj doğrulanmış tüm CLI'lere gönderilir. Her biri bağımsız cevap verir ve ortak geçmişi görebilir. Maliyet CLI sayısıyla yaklaşık doğru orantılıdır."
    },
    debate: {
      label: "Tartışma",
      desc: "Seçili ajanlar turlar halinde birbirlerine cevap verir, ardından Orkestra karar özeti üretir. Büyük kararlar ve mimari için uygundur. Token maliyeti yüksektir."
    }
  }
};

const uiText = {
  en: {
    welcome: "Hello! I am the Orkestra Planner. You can ask me to plan a project, chat, or write code.",
    connected: "Connected",
    disconnected: "Disconnected",
    switchDark: "Switch to dark theme",
    switchLight: "Switch to light theme",
    dragResize: "Drag to resize",
    close: "Close",
    generating: "Generating...",
    generatedEditable: "generated - you can edit it",
    generatingBrief: "Generating brief, please wait...",
    briefPlaceholder: "The brief will appear here...",
    regenerate: "Regenerate",
    cancel: "Cancel",
    approveBrief: "Approve and Send to Code",
    agentCenter: "Agent Center",
    refresh: "Refresh",
    readingCli: "Reading CLI status...",
    ready: "Ready",
    waiting: "Waiting",
    roles: "Roles",
    reset: "Reset",
    history: "History",
    plannerChat: "Planner Chat",
    newChat: "New chat",
    new: "New",
    chatHistory: "Chat history",
    clearChat: "Clear chat",
    clear: "Clear",
    isThinking: "is thinking",
    projectDetected: "Project detected",
    projectDetectedCopy: "You can turn this chat into a structured Code Task Brief and move to the coding stage.",
    createBrief: "Create Brief",
    continueChat: "Continue chat",
    mode: "Mode",
    needsTwoCli: "At least two verified CLIs are required.",
    rounds: "Rounds",
    remove: "Remove",
    noParticipants: "No participants yet — add below.",
    addParticipant: "Add participant",
    listening: "Listening...",
    send: "Send",
    composerPlaceholder: "Ask something or assign a task... (Enter sends - Shift+Enter new line - Ctrl+V paste image)",
    addImage: "Add image",
    removeAttachment: "Remove",
    whichCli: "Which CLI",
    noCli: "No CLI",
    reasoningEffort: "Reasoning effort",
    detailLevelTitle: "Detail Level (low: summarized history, medium: balanced, high: full history)",
    detailLow: "Low (Summarized)",
    detailMedium: "Balanced",
    detailHigh: "Deep (Full)",
    voiceInput: "Voice input",
    searchChats: "Search chats...",
    noMatchingChats: "No matching chats.",
    current: "Current",
    recentChats: "Recent chats",
    upDownNavigate: "Up/down to navigate",
    enterSelect: "Enter to select",
    escClose: "Esc close",
    delete: "Delete",
    savedChatHistory: "Chat History",
    noSavedChats: "No saved chats yet.",
    all: "All",
    logsWaiting: "Waiting for logs...",
    previous: "Previous",
    next: "Next",
    page: "Page",
    login: "Login",
    logout: "Logout",
    test: "Test",
    local: "Local",
    remote: "Remote",
    model: "model",
    limited: "limited",
    notInstalled: "Not installed",
    loginRequired: "Login required",
    quotaIssue: "Quota issue",
    responding: "Responding",
    geminiVerified: "Gemini verified",
    verified: "Verified",
    resets: "resets",
    staleUsage: "Warning: stale data - waiting for cligate update",
    now: "now",
    minLater: "min later",
    hLater: "h",
    dLater: "d",
    justNow: "just now",
    minAgo: "min ago",
    hAgo: "h ago",
    dAgo: "d ago",
    wAgo: "w ago",
    planner: "Planner",
    builder: "Builder",
    reviewer: "Reviewer",
    fixer: "Fixer",
    custom: "Custom",
    imageUploadFailed: "Image upload failed",
    decisionSummary: "Orkestra - Decision Summary",
    debateCouldNotStart: "Debate could not be started.",
    reviewAttachedImage: "Review the attached image.",
    attachment: "Attachment",
    user: "User",
    fallbackUsed: "Fallback was used.",
    plannerCouldNotRespond: "The planner could not respond",
    briefCouldNotBeGenerated: "Brief could not be generated",
    completed: "completed",
    status: "Status",
    system: "System",
    tabChat: "Chat",
    tabCode: "Code",
    noActiveRunTitle: "No Active Coding Run",
    noActiveRunDesc: "Select a previous execution from the history or start a new one by approving a Brief in the Chat tab.",
    runDetails: "Run Details",
    currentStep: "Current Step",
    duration: "Duration",
    workspacePath: "Workspace Path",
    briefShartname: "Execution Brief",
    terminalTitle: "Live Agent Execution Console",
    elapsedSeconds: "seconds",
    explorer: "Explorer",
    preview: "Preview",
    openInBrowser: "Open in browser",
    refreshPreview: "Refresh",
    noPreview: "No preview available",
    noPreviewDesc: "Run a task that generates HTML files to see a preview here.",
    codeChat: "Code Chat",
    fileViewer: "File Viewer",
    closeFile: "Close file",
    togglePreview: "Toggle preview panel",
    fileEditedNoun: "files edited",
    review: "Review",
    undo: "Undo",
    startRun: "Start",
    startRunTitle: "Start the agreed task in the pipeline without a brief",
    stop: "Stop",
    addNote: "Add note to the running task",
    steeringPlaceholder: "Task is running — leave a note for the next agent…",
    teamPlan: "Team Plan",
    teamPlanTitle: "Let the planner split the project into sub-tasks for the team",
    approvePlan: "Approve & Run Team",
    taskTitle: "Task description",
    role: "Role",
    folder: "Folder",
    dependsOn: "Depends on (ids)",
    addTask: "Add task",
    rolePlanner: "Planner",
    roleBuilder: "Builder",
    roleReviewer: "Reviewer",
    roleFixer: "Fixer",
    activity: "Activity",
    changedFiles: "Files",
    noActivity: "No activity yet.",
    noChangedFiles: "No file changes yet.",
    created: "Created",
    changed: "Changed",
    deleted: "Deleted",
    started: "Started",
    finished: "Finished",
    failedLabel: "Failed",
    limitDetected: "Limit detected",
    fallback: "Fallback",
    openFile: "Open file",
    noWorkspace: "No coding workspace selected",
    noWorkspaceDesc: "Start or select a coding run to browse generated files.",
    terminal: "Terminal",
    newPowerShell: "PowerShell",
    newCmd: "cmd",
    terminalPlaceholder: "Type a command and press Enter",
    noTerminal: "Open a PowerShell or cmd tab to start.",
    closeTerminal: "Close terminal",
    toggleTerminal: "Toggle terminal"
  },
  tr: {
    welcome: "Merhaba! Ben Orkestra Planlayıcısı. Proje planlamak, sohbet etmek veya kod yazmak için bana yazabilirsiniz.",
    connected: "Bağlı",
    disconnected: "Bağlı değil",
    switchDark: "Koyu temaya geç",
    switchLight: "Açık temaya geç",
    dragResize: "Sürükleyerek yeniden boyutlandır",
    close: "Kapat",
    generating: "Üretiliyor...",
    generatedEditable: "üretti - düzenleyebilirsin",
    generatingBrief: "Brief üretiliyor, lütfen bekleyin...",
    briefPlaceholder: "Brief burada görünecek...",
    regenerate: "Yeniden üret",
    cancel: "İptal",
    approveBrief: "Onayla ve Code'a aktar",
    agentCenter: "Ajan Merkezi",
    refresh: "Yenile",
    readingCli: "CLI durumu okunuyor...",
    ready: "Hazır",
    waiting: "Bekleniyor",
    roles: "Roller",
    reset: "Sıfırla",
    history: "Geçmiş",
    plannerChat: "Planlayıcı Sohbet",
    newChat: "Yeni sohbet",
    new: "Yeni",
    chatHistory: "Sohbet geçmişi",
    clearChat: "Sohbeti temizle",
    clear: "Temizle",
    isThinking: "düşünüyor",
    projectDetected: "Proje algılandı",
    projectDetectedCopy: "Bu sohbeti yapılandırılmış bir Code Task Brief'e dönüştürüp kod aşamasına geçebilirsin.",
    createBrief: "Brief oluştur",
    continueChat: "Sohbete devam et",
    mode: "Mod",
    needsTwoCli: "En az iki doğrulanmış CLI gerekli.",
    rounds: "Turlar",
    remove: "Kaldır",
    noParticipants: "Henüz katılımcı yok — aşağıdan ekle.",
    addParticipant: "Katılımcı ekle",
    listening: "Dinleniyor...",
    send: "Gönder",
    composerPlaceholder: "Bir şey sorun veya görev verin... (Enter gönderir - Shift+Enter yeni satır - Ctrl+V görsel yapıştır)",
    addImage: "Görsel ekle",
    removeAttachment: "Kaldır",
    whichCli: "Hangi CLI",
    noCli: "CLI yok",
    reasoningEffort: "Akıl yürütme seviyesi",
    detailLevelTitle: "Çalışma Seviyesi (düşük: özet geçmiş, dengeli: dengeli, derin: tam geçmiş)",
    detailLow: "Düşük (Özetli)",
    detailMedium: "Dengeli",
    detailHigh: "Derin (Tam)",
    voiceInput: "Sesli giriş",
    searchChats: "Sohbetlerde ara...",
    noMatchingChats: "Eşleşen sohbet yok.",
    current: "Şu anki",
    recentChats: "Son sohbetler",
    upDownNavigate: "Yukarı/aşağı gezin",
    enterSelect: "Enter ile seç",
    escClose: "Esc kapatır",
    delete: "Sil",
    savedChatHistory: "Geçmiş Sohbetler",
    noSavedChats: "Henüz kayıtlı sohbet yok.",
    all: "Tüm",
    logsWaiting: "Log bekleniyor...",
    previous: "Önceki",
    next: "Sonraki",
    page: "Sayfa",
    login: "Giriş",
    logout: "Çıkış",
    test: "Test",
    local: "Yerel",
    remote: "Uzak",
    model: "model",
    limited: "limitli",
    notInstalled: "Kurulu değil",
    loginRequired: "Giriş gerekli",
    quotaIssue: "Kota sorunu",
    responding: "Yanıt veriyor",
    geminiVerified: "Gemini doğrulandı",
    verified: "Doğrulandı",
    resets: "sıfırlanır",
    staleUsage: "Veri eski - cligate güncellemesi bekleniyor",
    now: "şimdi",
    minLater: "dk sonra",
    hLater: "sa",
    dLater: "gün",
    justNow: "az önce",
    minAgo: "dk önce",
    hAgo: "sa önce",
    dAgo: "gün önce",
    wAgo: "hafta önce",
    planner: "Planlayıcı",
    builder: "Kodlayıcı",
    reviewer: "Denetçi",
    fixer: "Düzeltici",
    custom: "Özel",
    imageUploadFailed: "Görsel yüklenemedi",
    decisionSummary: "Orkestra - Karar Özeti",
    debateCouldNotStart: "Tartışma başlatılamadı.",
    reviewAttachedImage: "Ekli görseli incele.",
    attachment: "Ek",
    user: "Kullanıcı",
    fallbackUsed: "Fallback kullanıldı.",
    plannerCouldNotRespond: "Planlayıcı yanıt veremedi",
    briefCouldNotBeGenerated: "Brief üretilemedi",
    completed: "tamamlandı",
    status: "Durum",
    system: "Sistem",
    tabChat: "Sohbet",
    tabCode: "Kodlama",
    noActiveRunTitle: "Aktif Kodlama Görevi Yok",
    noActiveRunDesc: "Sol panelden eski bir çalıştırma seçebilir veya Sohbet sekmesinden bir projeyi kararlaştırıp Brief oluşturarak yeni bir görev başlatabilirsiniz.",
    runDetails: "Çalıştırma Detayları",
    currentStep: "Aktif Aşama",
    duration: "Süre",
    workspacePath: "Çalışma Dizini",
    briefShartname: "Görev Şartnamesi (Brief)",
    terminalTitle: "Canlı Ajan İcra Konsolu",
    elapsedSeconds: "saniye",
    explorer: "Gezgin",
    preview: "Önizleme",
    openInBrowser: "Tarayıcıda aç",
    refreshPreview: "Yenile",
    noPreview: "Önizleme mevcut değil",
    noPreviewDesc: "Burada önizleme görmek için HTML dosyaları üreten bir görev çalıştırın.",
    codeChat: "Kod Sohbeti",
    fileViewer: "Dosya Görüntüleyici",
    closeFile: "Dosyayı kapat",
    togglePreview: "Önizleme panelini aç/kapat",
    fileEditedNoun: "dosya düzenlendi",
    review: "İncele",
    undo: "Geri Al",
    startRun: "Başlat",
    startRunTitle: "Brief oluşturmadan, konuşulan işi pipeline'da başlat",
    stop: "Dur",
    addNote: "Çalışan göreve not bırak",
    steeringPlaceholder: "Görev çalışıyor — sıradaki ajana not bırak…",
    teamPlan: "Ekip Planı",
    teamPlanTitle: "Plancı projeyi ekip için alt-görevlere bölsün",
    approvePlan: "Onayla ve Ekibi Başlat",
    taskTitle: "Görev açıklaması",
    role: "Rol",
    folder: "Klasör",
    dependsOn: "Bağımlılık (id)",
    addTask: "Görev ekle",
    rolePlanner: "Planlayıcı",
    roleBuilder: "Kodlayıcı",
    roleReviewer: "Denetçi",
    roleFixer: "Düzeltici",
    activity: "Aktivite",
    changedFiles: "Dosyalar",
    noActivity: "Henüz aktivite yok.",
    noChangedFiles: "Henüz dosya değişikliği yok.",
    created: "Oluşturuldu",
    changed: "Değişti",
    deleted: "Silindi",
    started: "Başladı",
    finished: "Bitti",
    failedLabel: "Hata",
    limitDetected: "Limit algılandı",
    fallback: "Fallback",
    openFile: "Dosyayı aç"
    ,
    noWorkspace: "Kodlama çalışma alanı seçilmedi",
    noWorkspaceDesc: "Üretilen dosyaları gezmek için bir kodlama görevi başlatın veya seçin.",
    terminal: "Terminal",
    newPowerShell: "PowerShell",
    newCmd: "cmd",
    terminalPlaceholder: "Komut yazıp Enter'a basın",
    noTerminal: "Başlamak için PowerShell veya cmd sekmesi açın.",
    closeTerminal: "Terminali kapat",
    toggleTerminal: "Terminali aç/kapat"
  }
} as const;

function welcomeMessageFor(language: Language): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    planner: "system",
    modelLabel: "Orkestra",
    content: uiText[language].welcome,
    createdAt: new Date().toISOString()
  };
}


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

type StoredConversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: string };
// Chat ve Code sekmelerinin geçmişleri ayrı saklanır.
const CHAT_CONVERSATIONS_KEY = "orkestra.conversations.chat";
const CODE_CONVERSATIONS_KEY = "orkestra.conversations.code";

function loadConversations(key: string): StoredConversation[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as StoredConversation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(key: string, items: StoredConversation[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, 50)));
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

  const [activeView, setActiveView] = useState<"chat" | "code">(() =>
    localStorage.getItem("orkestra.activeView") === "code" ? "code" : "chat"
  );

  useEffect(() => {
    localStorage.setItem("orkestra.activeView", activeView);
  }, [activeView]);

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
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];

  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  // Sürekli proje: aktif projenin kalıcı workspace yolu (yeni promptlar aynı projede devam eder).
  const [projectWorkspace, setProjectWorkspace] = useState<string | null>(
    () => localStorage.getItem("orkestra.projectWorkspace") || null
  );
  useEffect(() => {
    if (projectWorkspace) localStorage.setItem("orkestra.projectWorkspace", projectWorkspace);
    else localStorage.removeItem("orkestra.projectWorkspace");
  }, [projectWorkspace]);
  // Chat ve Code geçmişleri ayrı: mesajlar, konuşma listesi ve aktif id ayrı tutulur.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [welcomeMessageFor(language)]);
  const [codeMessages, setCodeMessages] = useState<ChatMessage[]>(() => [welcomeMessageFor(language)]);
  const [chatConvos, setChatConvos] = useState<StoredConversation[]>([]);
  const [codeConvos, setCodeConvos] = useState<StoredConversation[]>([]);
  const [chatConvoId, setChatConvoId] = useState<string>(() => crypto.randomUUID());
  const [codeConvoId, setCodeConvoId] = useState<string>(() => crypto.randomUUID());

  // Aktif sekmeye göre türetilmiş alias'lar — gerisi değişmeden çalışır.
  const isCodeView = activeView === "code";
  const messages = isCodeView ? codeMessages : chatMessages;
  const setMessages = isCodeView ? setCodeMessages : setChatMessages;
  const conversations = isCodeView ? codeConvos : chatConvos;
  const setConversations = isCodeView ? setCodeConvos : setChatConvos;
  const conversationId = isCodeView ? codeConvoId : chatConvoId;
  const setConversationId = isCodeView ? setCodeConvoId : setChatConvoId;

  const [chatInput, setChatInput] = useState("");
  const [attachments, setAttachments] = useState<{ path: string; name: string; preview: string }[]>([]);
  const [selectedEffort, setSelectedEffort] = useState<"low" | "medium" | "high">("low");
  const [selectedDetailLevel, setSelectedDetailLevel] = useState<"low" | "medium" | "high">("high");
  // Paralel/Tartışma katılımcıları: aynı CLI'den farklı modeller ayrı katılımcı olabilir.
  const [participants, setParticipants] = useState<{ cli: DebateParticipant; model: string }[]>([]);
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
  const [planOpen, setPlanOpen] = useState(false);
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [planMeta, setPlanMeta] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [openFileTabs, setOpenFileTabs] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionInfo[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});
  const [terminalCursors, setTerminalCursors] = useState<Record<string, number>>({});
  const terminalCursorsRef = useRef<Record<string, number>>({});

  const online = Boolean(cliStatus);
  const agentOptions = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const verifiedTools = useMemo(
    () => cliStatus?.tools.filter((tool) => tool.authenticated && tool.quotaOk) ?? [],
    [cliStatus]
  );
  // Verified CLIs available in single-agent mode.
  const cliOptions = useMemo(
    () => verifiedTools.map((tool) => tool.id as DebateParticipant),
    [verifiedTools]
  );
  const multiAvailable = verifiedTools.length > 1;
  const workspaceFileEventCount = useMemo(
    () => events.filter((event) => event.type === "file_created" || event.type === "file_changed" || event.type === "file_deleted").length,
    [events]
  );

  // The planner sent to the API is derived from the active mode.
  const selectedPlanner: PlannerChoice = mode === "multi" ? "all" : mode === "debate" ? "debate" : singleCli;

  // Katılımcılar varsayılan olarak her doğrulanmış CLI'den birer tane (default model).
  useEffect(() => {
    setParticipants((current) => {
      const validClis = verifiedTools.map((tool) => tool.id as DebateParticipant);
      const kept = current.filter((p) => validClis.includes(p.cli));
      return kept.length ? kept : validClis.map((cli) => ({ cli, model: "default" }));
    });
  }, [verifiedTools]);

  // Katılımcı eklemek için: her doğrulanmış CLI ve onun model seçenekleri.
  const participantSources = verifiedTools.map((tool) => ({
    cli: tool.id as DebateParticipant,
    label: displayToolName(tool.id),
    models: tool.modelOptions?.length ? tool.modelOptions : [{ id: "default", label: "default", limited: false }]
  }));

  // If the selected single-agent CLI is no longer verified, switch to the first valid one.
  useEffect(() => {
    if (cliOptions.length && !cliOptions.includes(singleCli)) setSingleCli(cliOptions[0]);
  }, [cliOptions, singleCli]);

  // Multi-agent and debate modes need at least two verified CLIs.
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
    setChatConvos(loadConversations(CHAT_CONVERSATIONS_KEY));
    setCodeConvos(loadConversations(CODE_CONVERSATIONS_KEY));
  }, []);

  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.id === "welcome" ? [welcomeMessageFor(language)] : current
    );
  }, [language]);

  // En az bir kullanıcı mesajı olan aktif sohbeti ilgili (chat/code) listeye kaydeder.
  function persistConvo(
    key: string,
    msgs: ChatMessage[],
    id: string,
    setConvos: React.Dispatch<React.SetStateAction<StoredConversation[]>>
  ) {
    if (!msgs.some((message) => message.role === "user")) return;
    const convo: StoredConversation = { id, title: deriveTitle(msgs), messages: msgs, updatedAt: new Date().toISOString() };
    setConvos((current) => {
      const next = [convo, ...current.filter((item) => item.id !== id)];
      saveConversations(key, next);
      return next;
    });
  }

  useEffect(() => {
    persistConvo(CHAT_CONVERSATIONS_KEY, chatMessages, chatConvoId, setChatConvos);
  }, [chatMessages, chatConvoId]);

  useEffect(() => {
    persistConvo(CODE_CONVERSATIONS_KEY, codeMessages, codeConvoId, setCodeConvos);
  }, [codeMessages, codeConvoId]);

  function newChat() {
    setMessages([welcomeMessageFor(language)]);
    setSuggestedPrompt(null);
    setAttachments([]);
    setNotice(null);
    setConversationId(crypto.randomUUID());
    // Code modunda "Yeni" = yeni proje: kalıcı workspace ve aktif run sıfırlanır.
    if (isCodeView) {
      setProjectWorkspace(null);
      setActiveRun(null);
      setEvents([]);
    }
  }

  function openConversation(id: string) {
    const convo = conversations.find((item) => item.id === id);
    if (!convo) return;
    setMessages(convo.messages.length ? convo.messages : [welcomeMessageFor(language)]);
    setConversationId(id);
    setSuggestedPrompt(null);
    setAttachments([]);
  }

  function deleteConversation(id: string) {
    const key = isCodeView ? CODE_CONVERSATIONS_KEY : CHAT_CONVERSATIONS_KEY;
    setConversations((current) => {
      const next = current.filter((item) => item.id !== id);
      saveConversations(key, next);
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

  const openFileInDialog = useCallback(async (path: string) => {
    setFileDialogOpen(true);
    setActiveFilePath(path);
    const name = path.split(/[\\/]/).pop() || path;
    setOpenFileTabs((current) =>
      current.some((tab) => tab.path === path) ? current : [...current, { path, name, content: "Loading..." }]
    );
    try {
      const res = await api.get<{ content: string }>(`/api/files/read?path=${encodeURIComponent(path)}`);
      setOpenFileTabs((current) =>
        current.map((tab) => (tab.path === path ? { ...tab, content: res.content } : tab))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOpenFileTabs((current) =>
        current.map((tab) => (tab.path === path ? { ...tab, content: `// Could not read file\n// ${message}` } : tab))
      );
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key === "`" || event.key === "\"" || event.key === "'") {
        event.preventDefault();
        setTerminalOpen((value) => !value);
        setActiveView("code");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      setNotice(`${text.imageUploadFailed}: ${error instanceof Error ? error.message : String(error)}`);
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
        modelLabel: isSummary ? text.decisionSummary : ev.modelLabel,
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
        participants: participants.map((p) => ({ cli: p.cli, model: p.model === "default" ? undefined : p.model })),
        rounds: debateRounds,
        effort: selectedEffort,
        detailLevel: selectedDetailLevel
      })
    });
    if (!res.ok || !res.body) throw new Error(await res.text().catch(() => text.debateCouldNotStart));
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

    const messageToSend = content || text.reviewAttachedImage;
    const displayContent = pending.length
      ? `${content}${content ? "\n\n" : ""}${text.attachment}: ${pending.map((item) => item.name).join(", ")}`
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
        source: text.user,
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
        detailLevel: selectedDetailLevel,
        participants: selectedPlanner === "all"
          ? participants.map((p) => ({ cli: p.cli, model: p.model === "default" ? undefined : p.model }))
          : undefined,
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
        setNotice(`${text.fallbackUsed} ${response.error}`);
        setStreamItems((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            source: text.system,
            type: "error",
            message: response.error ?? "",
            createdAt: new Date().toISOString()
          }
        ]);
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          planner: "system",
          modelLabel: text.system,
          content: `${text.plannerCouldNotRespond}: ${errorText}`,
          createdAt: new Date().toISOString()
        }
      ]);
      setStreamItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source: text.system,
          type: "error",
          message: errorText,
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function startRun(prompt: string) {
    // Aktif bir proje varsa aynı workspace'te devam et (sürekli geliştirme).
    const run = await api.post<Run>("/api/runs", {
      prompt,
      workspacePath: projectWorkspace ?? undefined
    });
    setActiveRun(run);
    setProjectWorkspace(run.workspacePath);
    setEvents([]);
    setSuggestedPrompt(null);
    await refresh();
  }

  // Ekip planı üret (plancı projeyi alt-görevlere böler) ve düzenleme modalını aç.
  async function createPlan() {
    setPlanOpen(true);
    setPlanLoading(true);
    setPlanMeta(null);
    try {
      const res = await api.post<{ tasks: PlanTask[]; planner: string; modelLabel: string }>("/api/plan", {
        history: messages,
        planner: "auto"
      });
      setPlanTasks(res.tasks ?? []);
      setPlanMeta(res.modelLabel);
    } catch (error) {
      setPlanTasks([]);
      setNotice(`${language === "tr" ? "Plan üretilemedi" : "Plan failed"}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPlanLoading(false);
    }
  }

  // Onaylanan ekip planını çalıştır (ekip modu run'ı).
  async function approvePlan() {
    if (!planTasks.length) return;
    setPlanOpen(false);
    const convo = messages.filter((m) => m.id !== "welcome" && m.content.trim());
    const goal = convo.map((m) => m.content).join("\n\n") || planTasks.map((t) => t.title).join("; ");
    const run = await api.post<Run>("/api/runs", {
      prompt: goal,
      tasks: planTasks,
      workspacePath: projectWorkspace ?? undefined
    });
    setActiveRun(run);
    setProjectWorkspace(run.workspacePath);
    setEvents([]);
    setSuggestedPrompt(null);
    await refresh();
  }

  // Çalışan run'a ara talimat (steering notu) bırak.
  async function addRunNote(note: string) {
    if (!activeRun || !note.trim()) return;
    try {
      await api.post(`/api/runs/${activeRun.id}/note`, { note: note.trim() });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  // Çalışan run'ı durdur.
  async function stopRun() {
    if (!activeRun) return;
    try {
      await api.post(`/api/runs/${activeRun.id}/stop`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  // Brief oluşturmadan, mevcut sohbette karar verilen işi doğrudan pipeline'a başlatır.
  function startFromChat() {
    const convo = messages.filter((m) => m.id !== "welcome" && m.content.trim());
    if (!convo.length) {
      setNotice(language === "tr" ? "Başlatmak için önce sohbette bir görev konuşun." : "Discuss a task in chat first.");
      return;
    }
    const transcript = convo
      .map((m) => `${m.role === "user" ? "Kullanıcı" : m.modelLabel || "Asistan"}: ${m.content}`)
      .join("\n\n");
    const prompt =
      (language === "tr"
        ? "Aşağıdaki sohbette üzerinde anlaşılan işi uygula:\n\n"
        : "Implement the task agreed upon in the conversation below:\n\n") + transcript;
    void startRun(prompt);
  }

  // Creates a Code Task Brief from the chat and opens the edit modal.
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
      setNotice(`${text.briefCouldNotBeGenerated}: ${error instanceof Error ? error.message : String(error)}`);
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
    setActiveView("code");
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
        setNotice(`${displayToolName(tool.id)}: ${actionLabel(action, language)} ${text.completed}. ${text.status}: ${statusText(updated, language)}.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshTerminals() {
    const result = await api.get<{ sessions: TerminalSessionInfo[] }>("/api/terminals");
    setTerminalSessions(result.sessions);
    setActiveTerminalId((current) => current ?? result.sessions[0]?.id ?? null);
  }

  async function createTerminal(shell: "powershell" | "cmd") {
    const session = await api.post<TerminalSessionInfo>("/api/terminals", {
      shell,
      cwd: activeRun?.workspacePath
    });
    setTerminalSessions((current) => [...current, session]);
    setActiveTerminalId(session.id);
    setTerminalOpen(true);
    setActiveView("code");
  }

  async function closeTerminal(id: string) {
    await fetch(`/api/terminals/${id}`, { method: "DELETE" });
    setTerminalSessions((current) => current.filter((session) => session.id !== id));
    setTerminalOutputs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setTerminalCursors((current) => {
      const next = { ...current };
      delete next[id];
      terminalCursorsRef.current = next;
      return next;
    });
    setActiveTerminalId((current) => {
      if (current !== id) return current;
      const remaining = terminalSessions.filter((session) => session.id !== id);
      return remaining[0]?.id ?? null;
    });
  }

  async function sendTerminalInput(id: string, value: string) {
    await api.post(`/api/terminals/${id}/input`, { data: `${value}\r` });
  }

  useEffect(() => {
    void refreshTerminals();
  }, []);

  useEffect(() => {
    if (!terminalOpen || !activeTerminalId) return;
    let cancelled = false;
    const poll = async () => {
      const offset = terminalCursorsRef.current[activeTerminalId] ?? 0;
      try {
        const result = await api.get<{ output: string; cursor: number }>(`/api/terminals/${activeTerminalId}/output?offset=${offset}`);
        if (cancelled) return;
        if (result.output) {
          setTerminalOutputs((current) => ({
            ...current,
            [activeTerminalId]: `${current[activeTerminalId] ?? ""}${result.output}`
          }));
        }
        setTerminalCursors((current) => {
          const next = { ...current, [activeTerminalId]: result.cursor };
          terminalCursorsRef.current = next;
          return next;
        });
      } catch {
        // Terminal may have been closed server-side; ignore until refresh.
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 800);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTerminalId, terminalOpen]);

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="brand">
          <img src="/logo.png" alt="Orkestra Logo" className="logo" />
          <strong>Orkestra</strong>
          <span>v2.0 Chat</span>
        </div>
        <div className="viewSwitcher">
          <button
            className={activeView === "chat" ? "active" : ""}
            onClick={() => setActiveView("chat")}
          >
            <MessageSquare size={16} />
            <span>{text.tabChat}</span>
          </button>
          <button
            className={activeView === "code" ? "active" : ""}
            onClick={() => setActiveView("code")}
          >
            <Code size={16} />
            <span>{text.tabCode}</span>
          </button>
        </div>
        <div className="headerActions">
          <button
            className="iconButton themeToggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title={theme === "light" ? text.switchDark : text.switchLight}
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
            {online ? text.connected : text.disconnected}
          </div>
        </div>
      </header>

      <section className="workspace">
        {activeView === "chat" ? (
          <>
            <aside className="leftColumn">
              <AgentCenter
                language={language}
                status={cliStatus}
                gitStatus={gitStatus}
                onRefresh={() => void refresh()}
                onAction={(tool, action) => void runCliAction(tool, action)}
              />
              <RolePanel agents={agents} onRefresh={() => void refresh()} language={language} />
            </aside>

            <section className="centerColumn">
              <div className="chatWrap" style={{ height: chatHeight }}>
                <ChatPanel
                  language={language}
                  messages={messages}
                  value={chatInput}
                  selectedPlanner={selectedPlanner}
                  selectedModel={selectedModel}
                  modelOptions={modelOptions}
                  selectedEffort={selectedEffort}
                  onEffortChange={setSelectedEffort}
                  selectedDetailLevel={selectedDetailLevel}
                  onDetailLevelChange={setSelectedDetailLevel}
                  participantSources={participantSources}
                  participants={participants}
                  onParticipantsChange={setParticipants}
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
                    setMessages([welcomeMessageFor(language)]);
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
                title={text.dragResize}
              >
                <span />
              </div>
              <StreamPanel items={streamItems} onClear={() => setStreamItems([])} language={language} />
            </section>
          </>
        ) : (
          <div className="codeLayout">
            <aside className="codeLeftCol">
              <AgentCenter
                language={language}
                status={cliStatus}
                gitStatus={gitStatus}
                onRefresh={() => void refresh()}
                onAction={(tool, action) => void runCliAction(tool, action)}
                compact
              />
              <RolePanel agents={agents} onRefresh={() => void refresh()} language={language} />
              <RunPanel
                runs={runs}
                activeRun={activeRun}
                onOpen={(run) => void openRun(run)}
              />
            </aside>

            <div className="codeCenterCol">
              <div className="codeChatSection codeChatFull">
                <CodeChatPanel
                  language={language}
                  messages={messages}
                  value={chatInput}
                  selectedPlanner={selectedPlanner}
                  selectedModel={selectedModel}
                  modelOptions={modelOptions}
                  selectedEffort={selectedEffort}
                  onEffortChange={setSelectedEffort}
                  selectedDetailLevel={selectedDetailLevel}
                  onDetailLevelChange={setSelectedDetailLevel}
                  mode={mode}
                  onModeChange={setMode}
                  multiAvailable={multiAvailable}
                  cliOptions={cliOptions}
                  singleCli={singleCli}
                  onSingleCliChange={setSingleCli}
                  thinking={isThinking}
                  onModelChange={setSelectedModel}
                  onChange={setChatInput}
                  onSend={(t) => void sendChat(t)}
                  onClear={() => { setMessages([welcomeMessageFor(language)]); setSuggestedPrompt(null); setAttachments([]); }}
                  onCreateBrief={() => void createBrief()}
                  onCreatePlan={() => void createPlan()}
                  onStart={startFromChat}
                  runActive={activeRun?.status === "running" || activeRun?.status === "queued"}
                  onAddNote={(note) => void addRunNote(note)}
                  onStopRun={() => void stopRun()}
                  attachments={attachments}
                  onAddImage={(file) => void addImage(file)}
                  onRemoveImage={removeImage}
                  conversations={conversations}
                  activeConversationId={conversationId}
                  onOpenConversation={openConversation}
                  onDeleteConversation={deleteConversation}
                  onNewChat={newChat}
                  run={activeRun}
                  events={events}
                  onOpenFile={(path) => void openFileInDialog(path)}
                  onTogglePreview={() => setShowPreview((current) => !current)}
                  previewOpen={showPreview}
                />
              </div>
            </div>

            <aside className="codeRightCol fileExplorerCol">
              <FileExplorer
                language={language}
                rootPath={activeRun?.workspacePath ?? projectWorkspace ?? null}
                refreshKey={workspaceFileEventCount}
                onOpenFile={(path) => void openFileInDialog(path)}
              />
            </aside>
          </div>
        )}
        {showPreview && activeView === "code" && (
          <div className="previewOverlay" onMouseDown={() => setShowPreview(false)}>
            <div className="previewDialog" onMouseDown={(event) => event.stopPropagation()}>
              <BrowserPreview
                run={activeRun}
                language={language}
                onClose={() => setShowPreview(false)}
              />
            </div>
          </div>
        )}
      </section>

      {activeView === "code" && (
        <IntegratedTerminal
          language={language}
          open={terminalOpen}
          sessions={terminalSessions}
          activeId={activeTerminalId}
          outputs={terminalOutputs}
          onToggle={() => setTerminalOpen((value) => !value)}
          onCreate={(shell) => void createTerminal(shell)}
          onClose={(id) => void closeTerminal(id)}
          onSelect={setActiveTerminalId}
          onInput={(id, value) => void sendTerminalInput(id, value)}
        />
      )}

      {fileDialogOpen && (
        <FileDialog
          language={language}
          rootPath={activeRun?.workspacePath ?? null}
          refreshKey={workspaceFileEventCount}
          tabs={openFileTabs}
          activePath={activeFilePath}
          onOpenFile={(path) => void openFileInDialog(path)}
          onSelect={setActiveFilePath}
          onCloseTab={(path) => {
            setOpenFileTabs((current) => current.filter((tab) => tab.path !== path));
            setActiveFilePath((current) => {
              if (current !== path) return current;
              const remaining = openFileTabs.filter((tab) => tab.path !== path);
              return remaining[0]?.path ?? null;
            });
          }}
          onClose={() => setFileDialogOpen(false)}
        />
      )}

      {briefOpen && (
        <div className="briefOverlay" onMouseDown={() => setBriefOpen(false)}>
          <div className="briefDialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="briefHead">
              <strong>Code Task Brief</strong>
              <span className="briefMeta">{briefLoading ? text.generating : briefMeta ? `${briefMeta} ${text.generatedEditable}` : ""}</span>
              <button className="iconButton" onClick={() => setBriefOpen(false)} title={text.close}>
                <X size={16} />
              </button>
            </div>
            <textarea
              className="briefText"
              value={briefLoading ? text.generatingBrief : briefText}
              readOnly={briefLoading}
              onChange={(event) => setBriefText(event.target.value)}
              placeholder={text.briefPlaceholder}
            />
            <div className="briefActions">
              <button onClick={() => void createBrief()} disabled={briefLoading}>
                <RefreshCw size={15} />
                {text.regenerate}
              </button>
              <div className="briefActionsRight">
                <button onClick={() => setBriefOpen(false)}>{text.cancel}</button>
                <button className="primary" onClick={approveBrief} disabled={briefLoading || !briefText.trim()}>
                  <Play size={15} />
                  {text.approveBrief}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {planOpen && (
        <div className="briefOverlay" onMouseDown={() => setPlanOpen(false)}>
          <div className="briefDialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="briefHead">
              <strong>{text.teamPlan}</strong>
              <span className="briefMeta">{planLoading ? text.generating : planMeta ? `${planMeta} ${text.generatedEditable}` : ""}</span>
              <button className="iconButton" onClick={() => setPlanOpen(false)} title={text.close}>
                <X size={16} />
              </button>
            </div>
            <div className="planList">
              {planLoading && <p className="muted">{text.generating}</p>}
              {!planLoading && planTasks.map((task, index) => (
                <div className="planTaskRow" key={index}>
                  <input
                    className="planTaskTitle"
                    value={task.title}
                    placeholder={text.taskTitle}
                    onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, title: e.target.value } : t)))}
                  />
                  <select
                    className="pill"
                    value={task.role ?? "builder"}
                    title={text.role}
                    onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, role: e.target.value as AgentRole } : t)))}
                  >
                    <option value="planner">{text.rolePlanner}</option>
                    <option value="builder">{text.roleBuilder}</option>
                    <option value="reviewer">{text.roleReviewer}</option>
                    <option value="fixer">{text.roleFixer}</option>
                  </select>
                  <input
                    className="planTaskFolder"
                    value={task.folder ?? ""}
                    placeholder={text.folder}
                    onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, folder: e.target.value } : t)))}
                  />
                  <input
                    className="planTaskDeps"
                    value={(task.dependsOn ?? []).join(", ")}
                    placeholder={text.dependsOn}
                    onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, dependsOn: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : t)))}
                  />
                  <button className="iconButton" onClick={() => setPlanTasks((cur) => cur.filter((_, i) => i !== index))} title={text.remove}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {!planLoading && (
                <button
                  className="ghostButton"
                  onClick={() => setPlanTasks((cur) => [...cur, { id: `task${cur.length + 1}`, title: "", role: "builder", folder: "", dependsOn: [] }])}
                >
                  <Plus size={14} /> {text.addTask}
                </button>
              )}
            </div>
            <div className="briefActions">
              <button onClick={() => void createPlan()} disabled={planLoading}>
                <RefreshCw size={15} />
                {text.regenerate}
              </button>
              <div className="briefActionsRight">
                <button onClick={() => setPlanOpen(false)}>{text.cancel}</button>
                <button className="primary" onClick={() => void approvePlan()} disabled={planLoading || !planTasks.length}>
                  <Play size={15} />
                  {text.approvePlan}
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
  language,
  status,
  gitStatus,
  onRefresh,
  onAction,
  compact = false
}: {
  language: Language;
  status: CliStatusResponse | null;
  gitStatus: GitStatus | null;
  onRefresh: () => void;
  onAction: (tool: CliToolStatus, action: "login" | "logout" | "test") => void;
  compact?: boolean;
}) {
  const tools = status?.tools ?? [];
  const text = uiText[language];
  return (
    <section className={`glassPanel${compact ? " agentCenterCompact" : ""}`}>
      <div className="panelTitle split">
        <span>
          <Zap size={17} />
          {text.agentCenter}
        </span>
        <button className="iconButton" onClick={onRefresh} title={text.refresh}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="agentCards">
        {tools.map((tool) => (
          <article className="agentCard" key={tool.id}>
            <div className={`agentIcon ${tool.id}`}>{iconForTool(tool.id)}</div>
            <div className="agentInfo">
              <strong>{displayToolName(tool.id)}</strong>
              {!compact && <span>{statusText(tool, language)}</span>}
              {!compact && tool.lastError && <small>{tool.lastError}</small>}
              <UsageBars usage={tool.usage} language={language} />
              {!compact && tool.modelOptions?.length ? (
                <small>{tool.modelOptions.length} {text.model} - {tool.modelOptions.filter((m) => m.limited).length} {text.limited}</small>
              ) : null}
            </div>
            {!compact && (
              <div className="agentActions">
                <button onClick={() => onAction(tool, "test")}>{text.test}</button>
                {tool.authenticated ? (
                  <button className="danger" onClick={() => onAction(tool, "logout")}>
                    {text.logout}
                  </button>
                ) : (
                  <button className="login" onClick={() => onAction(tool, "login")}>
                    {text.login}
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
        {!tools.length && <p className="muted">{text.readingCli}</p>}

        {!compact && (
        <article className="agentCard compact">
          <div className="agentIcon git">
            <svg fill="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ flex: "none", display: "block" }}>
              <path d="M23.384 11.41L12.59.616a1.686 1.686 0 00-2.388 0L8.03 2.79l2.766 2.766a1.71 1.71 0 011.848.367 1.724 1.724 0 01.425 1.712l2.775 2.775a1.724 1.724 0 011.712.425 1.71 1.71 0 01-.426 2.628c-.562.184-1.242.052-1.712-.418a1.72 1.72 0 01-.425-1.712l-2.775-2.775v5.153a1.712 1.712 0 11-1.077 0V9.33L8.344 6.3a1.724 1.724 0 01-1.21.346 1.712 1.712 0 01-1.212-.367L2.156 10.04a1.712 1.712 0 01.366 1.21 1.716 1.716 0 01-.366 1.215v5.152a1.712 1.712 0 11-1.078 0v-5.152a1.712 1.712 0 01.367-1.215l2.78-2.78a1.71 1.71 0 011.848-.367l2.784-2.784a1.686 1.686 0 00-2.388 0L.616 11.41a1.686 1.686 0 000 2.388l10.795 10.795a1.686 1.686 0 002.388 0l10.795-10.795a1.686 1.686 0 000-2.388z"/>
            </svg>
          </div>
          <div className="agentInfo">
            <strong>Git</strong>
            <span>{gitStatus ? text.ready : text.waiting}</span>
          </div>
          <div className="statusBadge ready">{gitStatus?.hasRemote ? text.remote : text.local}</div>
        </article>
        )}
      </div>
    </section>
  );
}

function RolePanel({
  agents,
  onRefresh,
  language
}: {
  agents: Agent[];
  onRefresh: () => void;
  language: Language;
}) {
  const roles: AgentRole[] = ["planner", "builder", "reviewer", "fixer"];
  const text = uiText[language];

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/api/agents/${id}/activate`);
      onRefresh();
    } catch (err) {
      console.error("Agent activation failed:", err);
    }
  };

  const handleReset = async () => {
    try {
      await api.post("/api/agents/reset");
      onRefresh();
    } catch (err) {
      console.error("Agents reset failed:", err);
    }
  };

  return (
    <section className="glassPanel">
      <div className="panelTitle">
        <Settings2 size={17} />
        <span>{text.roles}</span>
      </div>
      {roles.map((role) => {
        const selectedId = agents.find((a) => a.role === role && a.enabled)?.id ?? "";
        const roleAgents = agents.filter((a) => a.role === role);
        return (
          <label className="roleSelect" key={role}>
            <span>{roleLabel(role, language)}</span>
            <select
              value={selectedId}
              onChange={(event) => void handleActivate(event.target.value)}
            >
              {roleAgents.length === 0 ? (
                <option value="">(Yok)</option>
              ) : (
                roleAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} {agent.status === "limited" ? `(${text.limited})` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
        );
      })}
      <button className="resetButton" onClick={() => void handleReset()}>
        <RotateCcw size={14} />
        {text.reset}
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
        <span>History</span>
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
  language,
  messages,
  value,
  selectedPlanner,
  selectedModel,
  modelOptions,
  selectedEffort,
  onEffortChange,
  selectedDetailLevel,
  onDetailLevelChange,
  participantSources,
  participants,
  onParticipantsChange,
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
  language: Language;
  messages: ChatMessage[];
  value: string;
  selectedPlanner: PlannerChoice;
  selectedModel: string;
  modelOptions: ModelOption[];
  selectedEffort: "low" | "medium" | "high";
  onEffortChange: (effort: "low" | "medium" | "high") => void;
  selectedDetailLevel: "low" | "medium" | "high";
  onDetailLevelChange: (detailLevel: "low" | "medium" | "high") => void;
  participantSources: { cli: DebateParticipant; label: string; models: ModelOption[] }[];
  participants: { cli: DebateParticipant; model: string }[];
  onParticipantsChange: (next: { cli: DebateParticipant; model: string }[]) => void;
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
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];
  const modeMeta = modeMetaByLanguage[language];
  const [showHistory, setShowHistory] = useState(false);
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
          <span>{text.plannerChat}</span>
          <strong>{plannerLabels[selectedPlanner]}</strong>
        </div>
        <div className="chatTools">
          <button className="ghostButton" onClick={onNewChat} title={text.newChat}>
            <Plus size={15} />
            {text.new}
          </button>
          <button
            className="ghostButton"
            onClick={() => setShowHistory(true)}
            title={text.chatHistory}
          >
            <History size={15} />
            {text.history}
          </button>
          <button className="ghostButton" onClick={onClear} title={text.clearChat}>
            {text.clear}
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
              <span>{plannerLabels[selectedPlanner]} {text.isThinking}</span>
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
              <strong>{text.projectDetected}</strong>
              <p>{text.projectDetectedCopy}</p>
            </div>
            <div className="pipelineActions">
              <button className="primary" onClick={onCreateBrief}>
                <Play size={16} />
                {text.createBrief}
              </button>
              <button onClick={onDismissPipeline}>{text.continueChat}</button>
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
                {modeMeta[item].label} {text.mode}
                <span className="modeTip">{disabled ? text.needsTwoCli : modeMeta[item].desc}</span>
              </button>
            );
          })}
        </div>
        {(mode === "debate" || mode === "multi") && (
          <div className="debateControls">
            <ParticipantPicker
              language={language}
              sources={participantSources}
              participants={participants}
              onChange={onParticipantsChange}
            />
            {mode === "debate" && (
              <label className="roundsPicker">
                {text.rounds}
                <select value={debateRounds} onChange={(event) => onRoundsChange(Number(event.target.value))}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
            )}
          </div>
        )}

      <div className={`composerBox${listening ? " recording" : ""}`}>
        {attachments.length > 0 && (
          <div className="attachmentRow">
            {attachments.map((item) => (
              <div className="attachmentChip" key={item.path}>
                <img src={item.preview} alt={item.name} />
                <span>{item.name}</span>
                <button onClick={() => onRemoveImage(item.path)} title={text.remove}>
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
            <span className="voiceText">{liveTranscript || text.listening}</span>
            <button className="iconRound voiceCancel" onClick={() => stopVoice(false)} title={text.cancel}>
              <X size={17} />
            </button>
            <button className="iconRound sendCircle" onClick={() => stopVoice(true)} title={text.send}>
              <ArrowUp size={18} />
            </button>
          </div>
        ) : (
          <>
            <textarea
              className="composerInput"
              value={value}
              placeholder={text.composerPlaceholder}
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
                <button className="iconRound" onClick={() => fileInputRef.current?.click()} title={text.addImage}>
                  <Plus size={18} />
                </button>
                {mode === "single" && (
                  <select
                    className="pill"
                    value={cliOptions.includes(singleCli) ? singleCli : ""}
                    disabled={!cliOptions.length}
                    title={text.whichCli}
                    onChange={(event) => onSingleCliChange(event.target.value as DebateParticipant)}
                  >
                    {!cliOptions.length && <option value="">{text.noCli}</option>}
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
                      {model.limited ? ` - ${text.limited}${model.resetsAt ? ` (${resetLabel(model.resetsAt, language)})` : ""}` : ""}
                    </option>
                  ))}
                </select>
                )}
                {mode === "single" && (selectedPlanner === "claude" || selectedPlanner === "codex") && (
                  <select
                    className="pill"
                    value={selectedEffort}
                    title={text.reasoningEffort}
                    onChange={(event) => onEffortChange(event.target.value as "low" | "medium" | "high")}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                )}
                <select
                  className="pill"
                  value={selectedDetailLevel}
                  title={text.detailLevelTitle}
                  onChange={(event) => onDetailLevelChange(event.target.value as "low" | "medium" | "high")}
                >
                  <option value="low">{text.detailLow}</option>
                  <option value="medium">{text.detailMedium}</option>
                  <option value="high">{text.detailHigh}</option>
                </select>
              </div>
              <div className="composerBarRight">
                {voiceSupported && (
                  <button className="iconRound" onClick={startVoice} title={text.voiceInput}>
                    <Mic size={18} />
                  </button>
                )}
                <button
                  className="iconRound sendCircle"
                  disabled={(!value.trim() && !attachments.length) || thinking || !cliOptions.length}
                  onClick={() => onSend()}
                  title={text.send}
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      <HistoryDialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onOpenConversation={onOpenConversation}
        onDeleteConversation={onDeleteConversation}
        language={language}
      />
    </section>
  );
}

function HistoryDialog({
  open,
  onClose,
  conversations,
  activeConversationId,
  onOpenConversation,
  onDeleteConversation,
  language
}: {
  open: boolean;
  onClose: () => void;
  conversations: StoredConversation[];
  activeConversationId: string;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  language: Language;
}) {
  const text = uiText[language];
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);
  if (!open) return null;
  const filtered = conversations.filter((convo) =>
    convo.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  const active = filtered.find((convo) => convo.id === activeConversationId);
  const recent = filtered.filter((convo) => convo.id !== activeConversationId);
  const flat = active ? [active, ...recent] : recent;
  const openHighlighted = () => {
    const target = flat[Math.min(index, flat.length - 1)];
    if (target) {
      onOpenConversation(target.id);
      onClose();
    }
  };
  return (
    <div className="historyOverlay" onMouseDown={onClose}>
      <div className="historyDialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="historySearch">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            placeholder={text.searchChats}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              else if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((i) => Math.min(i + 1, flat.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                openHighlighted();
              }
            }}
          />
        </div>
        <div className="historyList">
          {flat.length === 0 && <div className="historyEmpty">{text.noMatchingChats}</div>}
          {active && (
            <>
              <div className="historyGroup">{text.current}</div>
              <HistoryRow
                language={language}
                convo={active}
                highlighted={index === 0}
                onOpen={() => {
                  onOpenConversation(active.id);
                  onClose();
                }}
                onDelete={() => onDeleteConversation(active.id)}
              />
            </>
          )}
          {recent.length > 0 && <div className="historyGroup">{text.recentChats}</div>}
          {recent.map((convo, i) => {
            const flatIndex = active ? i + 1 : i;
            return (
              <HistoryRow
                language={language}
                key={convo.id}
                convo={convo}
                highlighted={index === flatIndex}
                onOpen={() => {
                  onOpenConversation(convo.id);
                  onClose();
                }}
                onDelete={() => onDeleteConversation(convo.id)}
              />
            );
          })}
        </div>
        <div className="historyFooter">
          <span>{text.upDownNavigate}</span>
          <span>{text.enterSelect}</span>
          <span>{text.escClose}</span>
        </div>
      </div>
    </div>
  );
}

// Paralel/Tartışma katılımcı editörü: aynı CLI'den farklı modeller ayrı katılımcı eklenebilir.
function ParticipantPicker({
  language,
  sources,
  participants,
  onChange
}: {
  language: Language;
  sources: { cli: DebateParticipant; label: string; models: ModelOption[] }[];
  participants: { cli: DebateParticipant; model: string }[];
  onChange: (next: { cli: DebateParticipant; model: string }[]) => void;
}) {
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];
  const [addCli, setAddCli] = useState<DebateParticipant | "">("");
  const [addModel, setAddModel] = useState("default");
  const activeSource = sources.find((s) => s.cli === addCli);

  function add() {
    if (!addCli) return;
    if (participants.some((p) => p.cli === addCli && p.model === addModel)) return;
    onChange([...participants, { cli: addCli, model: addModel }]);
  }

  function modelLabel(cli: DebateParticipant, model: string) {
    const src = sources.find((s) => s.cli === cli);
    return src?.models.find((m) => m.id === model)?.label ?? model;
  }

  return (
    <div className="participantPicker">
      <div className="partChips">
        {participants.map((p, index) => (
          <span className="partChip on" key={`${p.cli}-${p.model}-${index}`}>
            {plannerLabels[p.cli]}{p.model !== "default" ? ` · ${modelLabel(p.cli, p.model)}` : ""}
            <button
              className="partChipRemove"
              onClick={() => onChange(participants.filter((_, i) => i !== index))}
              title={text.remove}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {participants.length === 0 && <span className="partEmpty">{text.noParticipants}</span>}
      </div>
      <div className="partAddRow">
        <select
          className="pill"
          value={addCli}
          onChange={(e) => {
            setAddCli(e.target.value as DebateParticipant);
            setAddModel("default");
          }}
        >
          <option value="">{text.addParticipant}</option>
          {sources.map((s) => (
            <option key={s.cli} value={s.cli}>{s.label}</option>
          ))}
        </select>
        {activeSource && (
          <select className="pill" value={addModel} onChange={(e) => setAddModel(e.target.value)}>
            {activeSource.models.map((m) => (
              <option key={m.id} value={m.id} disabled={m.limited}>{m.label}</option>
            ))}
          </select>
        )}
        <button className="iconRound" onClick={add} disabled={!addCli} title={text.addParticipant}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function agoLabel(iso: string, language: Language) {
  const text = uiText[language];
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return text.justNow;
  if (mins < 60) return `${mins} ${text.minAgo}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${text.hAgo}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${text.dAgo}`;
  return `${Math.floor(days / 7)} ${text.wAgo}`;
}

function HistoryRow({
  language,
  convo,
  highlighted,
  onOpen,
  onDelete
}: {
  language: Language;
  convo: StoredConversation;
  highlighted: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const text = uiText[language];
  return (
    <div className={`historyItem${highlighted ? " highlighted" : ""}`} onClick={onOpen}>
      <span className="historyItemTitle">{convo.title}</span>
      <span className="historyItemTime">{agoLabel(convo.updatedAt, language)}</span>
      <button
        className="historyItemDelete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title={text.delete}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ConversationsPanel({
  language,
  conversations,
  activeId,
  onOpen,
  onDelete,
  onNew
}: {
  language: Language;
  conversations: StoredConversation[];
  activeId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const text = uiText[language];
  return (
    <section className="glassPanel">
      <div className="panelTitle split">
        <span>
          <History size={17} />
          {text.savedChatHistory}
        </span>
        <button className="iconButton" onClick={onNew} title={text.newChat}>
          <Plus size={15} />
        </button>
      </div>
      <div className="conversationList">
        {conversations.length === 0 && <small className="historyEmpty">{text.noSavedChats}</small>}
        {conversations.map((convo) => (
          <div key={convo.id} className={`conversationItem${convo.id === activeId ? " active" : ""}`}>
            <button className="conversationOpen" onClick={() => onOpen(convo.id)}>
              <MessageCircle size={14} />
              <span>{convo.title}</span>
            </button>
            <button className="conversationDelete" onClick={() => onDelete(convo.id)} title={text.delete}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function StreamPanel({ items, onClear, language }: { items: StreamItem[]; onClear: () => void; language: Language }) {
  const [activeTab, setActiveTab] = useState<"all" | "claude" | "codex" | "ag" | "system">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const text = uiText[language];

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
        <button onClick={onClear}>{text.clear}</button>
      </div>
      <div className="streamTabs">
        <button
          className={activeTab === "all" ? "active" : ""}
          onClick={() => setActiveTab("all")}
        >
          {text.all}
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
          <p>{text.logsWaiting}</p>
        )}
      </div>
      {totalPages > 1 && (
        <div className="streamPagination">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            {text.previous}
          </button>
          <span>{text.page} {currentPage} / {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            {text.next}
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

function statusText(tool: CliToolStatus, language: Language) {
  const text = uiText[language];
  if (!tool.installed) return text.notInstalled;
  if (!tool.authenticated) return text.loginRequired;
  if (!tool.quotaOk) return text.quotaIssue;
  if (tool.responding) return text.responding;
  if (tool.id === "antigravity") return text.geminiVerified;
  return text.verified;
}

function UsageBars({ usage, language }: { usage?: CliToolStatus["usage"]; language: Language }) {
  const text = uiText[language];
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
          {window.resetsAt && <small className="usageReset">{text.resets} {resetLabel(window.resetsAt, language)}</small>}
        </div>
      ))}
      {usage.stale && <small className="usageStale">{text.staleUsage}</small>}
    </div>
  );
}

function resetLabel(iso: string, language: Language) {
  const text = uiText[language];
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffMs = t - Date.now();
  if (diffMs <= 0) return text.now;
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} ${text.minLater}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${text.hLater} ${mins % 60} ${text.minLater}`;
  const days = Math.floor(hours / 24);
  return `${days} ${text.dLater} ${hours % 24} ${text.hLater}`;
}

function ActiveRunView({
  run,
  events,
  language,
  onOpenFile
}: {
  run: Run | null;
  events: RunEvent[];
  language: Language;
  onOpenFile?: (path: string) => void;
}) {
  const text = uiText[language];
  const [briefExpanded, setBriefExpanded] = useState(true);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (run && run.status === "running") {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [run?.status, run?.id]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (!run) {
    return (
      <div className="codePlaceholder">
        <Cpu size={48} />
        <h3>{text.noActiveRunTitle}</h3>
        <p>{text.noActiveRunDesc}</p>
      </div>
    );
  }

  const getDuration = () => {
    if (!run.createdAt) return "";
    const start = Date.parse(run.createdAt);
    const end = run.completedAt ? Date.parse(run.completedAt) : now;
    const diffSec = Math.max(0, Math.round((end - start) / 1000));
    return `${diffSec} ${text.elapsedSeconds}`;
  };

  const activityItems = buildActivityItems(events, language);
  const fileChanges = buildFileChanges(events, language);
  const openRunFile = (relativePath: string) => {
    if (!run || !onOpenFile) return;
    onOpenFile(`${run.workspacePath}/${relativePath}`);
  };

  return (
    <div className="activeRunContainer">
      <header className="activeRunHeader">
        <div className="activeRunMeta">
          <h2>{text.runDetails}: {run.prompt.slice(0, 32)}{run.prompt.length > 32 ? "..." : ""}</h2>
          <p>
            <strong>{text.workspacePath}: </strong>
            <code style={{ fontSize: "0.8rem", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "4px" }}>
              {run.workspacePath}
            </code>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="activeRunMeta" style={{ alignItems: "flex-end" }}>
            <p style={{ margin: 0, fontSize: "0.75rem" }}>
              {text.currentStep}: <strong style={{ color: "var(--text-primary)" }}>{run.activeStep || "starting"}</strong>
            </p>
            <p style={{ margin: 0, fontSize: "0.75rem" }}>
              {text.duration}: <strong>{getDuration()}</strong>
            </p>
          </div>
          <div className={`activeRunBadge ${run.status}`}>
            <span />
            {run.status}
          </div>
        </div>
      </header>

      <div className="briefAccordion">
        <div className="briefAccordionHeader" onClick={() => setBriefExpanded(!briefExpanded)}>
          <strong>{text.briefShartname}</strong>
          {briefExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {briefExpanded && (
          <div className="briefAccordionContent" style={{ whiteSpace: "pre-wrap" }}>
            {run.prompt}
          </div>
        )}
      </div>

      <div className="runInsightGrid">
        <section className="runInsightPanel activityPanel">
          <div className="runInsightHeader">
            <strong>{text.activity}</strong>
            <span>{activityItems.length}</span>
          </div>
          <div className="activityList">
            {activityItems.length ? (
              activityItems.map((item) => (
                <article className={`activityItem ${item.tone}`} key={item.id}>
                  <span className="activityDot" />
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.message}</p>
                  </div>
                  <time>{formatRunEventTime(item.createdAt)}</time>
                </article>
              ))
            ) : (
              <p className="runInsightEmpty">{text.noActivity}</p>
            )}
          </div>
        </section>

        <section className="runInsightPanel filesPanel">
          <div className="runInsightHeader">
            <strong>{text.changedFiles}</strong>
            <span>{fileChanges.length}</span>
          </div>
          <div className="changedFileList">
            {fileChanges.length ? (
              fileChanges.map((file) => (
                <button
                  className={`changedFileRow ${file.type}`}
                  key={file.path}
                  disabled={file.type === "file_deleted"}
                  onClick={() => file.type !== "file_deleted" && openRunFile(file.path)}
                  title={text.openFile}
                >
                  <span>{file.label}</span>
                  <code>{file.path}</code>
                </button>
              ))
            ) : (
              <p className="runInsightEmpty">{text.noChangedFiles}</p>
            )}
          </div>
        </section>
      </div>

      <div className="terminalConsole">
        <div className="terminalHeader">
          <span>{text.terminalTitle}</span>
          <span>SYSTEM ONLINE</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, overflowY: "auto" }}>
          {events.map((event) => (
            <CollapsibleTerminalLine key={event.id} event={event} />
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
}

function buildActivityItems(events: RunEvent[], language: Language) {
  const text = uiText[language];
  return events
    .filter((event) => event.type !== "stdout" && event.type !== "stderr")
    .slice(-24)
    .map((event) => {
      const label =
        event.type === "queued" ? text.waiting :
        event.type === "started" ? text.started :
        event.type === "agent_step" ? text.activity :
        event.type === "completed" ? text.finished :
        event.type === "failed" ? text.failedLabel :
        event.type === "limit_detected" ? text.limitDetected :
        event.type === "fallback_used" ? text.fallback :
        event.type === "file_created" ? text.created :
        event.type === "file_changed" ? text.changed :
        event.type === "file_deleted" ? text.deleted :
        event.type;
      const tone =
        event.type === "failed" || event.type === "limit_detected" ? "danger" :
        event.type === "completed" || event.type.startsWith("file_") ? "success" :
        event.type === "fallback_used" ? "warn" :
        "info";
      return {
        id: event.id,
        label,
        tone,
        message: event.agentId ? `${event.agentId}: ${event.message}` : event.message,
        createdAt: event.createdAt
      };
    });
}

function buildFileChanges(events: RunEvent[], language: Language) {
  const text = uiText[language];
  const files = new Map<string, { path: string; type: "file_created" | "file_changed" | "file_deleted"; label: string }>();
  for (const event of events) {
    if (event.type !== "file_created" && event.type !== "file_changed" && event.type !== "file_deleted") continue;
    const path = event.rawOutput || event.message;
    files.set(path, {
      path,
      type: event.type,
      label: event.type === "file_created" ? text.created : event.type === "file_changed" ? text.changed : text.deleted
    });
  }
  return Array.from(files.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function agentBadgeClass(agentId?: string | null) {
  if (!agentId) return "system";
  const id = agentId.toLowerCase();
  if (id.includes("claude")) return "claude";
  if (id.includes("codex")) return "codex";
  if (id.includes("gemini") || id.includes("agy") || id.includes("antigravity")) return "antigravity";
  return "system";
}

// Run event'lerini ajan bazında gruplar (dosya event'leri ayrı işlenir).
function groupAgentEvents(events: RunEvent[]): Map<string, RunEvent[]> {
  const groups = new Map<string, RunEvent[]>();
  for (const event of events) {
    if (event.type.startsWith("file_")) continue;
    const key = event.agentId || "orkestra";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return groups;
}

// Her ajan için tek bir açılır-kapanır kart; son 5 işlemi gösterir.
function AgentActivitySection({
  events,
  language,
  onOpenFile
}: {
  events: RunEvent[];
  language: Language;
  onOpenFile?: (path: string) => void;
}) {
  const fileEvents = events.filter((event) => event.type.startsWith("file_"));
  const groups = groupAgentEvents(events);
  if (!groups.size && !fileEvents.length) return null;
  return (
    <div className="agentActivitySection">
      {[...groups.entries()].map(([agentId, evts]) => (
        <AgentActivityCard key={agentId} agentId={agentId} events={evts} />
      ))}
      {fileEvents.length > 0 && (
        <FileChangeBundle files={fileEvents} language={language} onOpenFile={onOpenFile} />
      )}
    </div>
  );
}

function AgentActivityCard({ agentId, events }: { agentId: string; events: RunEvent[] }) {
  const [open, setOpen] = useState(false);
  const last5 = events.slice(-5);
  const latest = events[events.length - 1];
  const done = events.some((e) => e.type === "completed");
  const failed = events.some((e) => e.type === "failed" || e.type === "limit_detected");
  const state = failed ? "failed" : done ? "completed" : "running";
  return (
    <div className={`agentActivityCard ${state}`}>
      <div className="agentActivityHead" onClick={() => setOpen((o) => !o)}>
        <span className={`agentDot ${state}`} />
        <span className={`badge ${agentBadgeClass(agentId)}`}>{agentId}</span>
        <span className="agentActivityLast">{latest?.message?.replace(/\s+/g, " ").slice(0, 64)}</span>
        <span className="agentActivityCount">{events.length}</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </div>
      {open && (
        <div className="agentActivityBody">
          {last5.map((event) => (
            <div className={`agentActivityLine ${event.type}`} key={event.id}>
              <time>{formatRunEventTime(event.createdAt)}</time>
              <span>{(event.rawOutput || event.message).replace(/\s+/g, " ").slice(0, 220)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// file_* event'inin rawOutput'undan {path, adds, dels} çıkarır (JSON; değilse düz yol).
function parseFileChange(event: RunEvent): { path: string; adds: number; dels: number } {
  const raw = event.rawOutput || event.message || "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.path === "string") {
      return { path: parsed.path, adds: Number(parsed.adds) || 0, dels: Number(parsed.dels) || 0 };
    }
  } catch {
    // Düz yol (eski format veya PROMPT.md gibi).
  }
  return { path: raw, adds: 0, dels: 0 };
}

// Son haline göre dosya başına +/- toplar (en yeni event kazanır).
function fileChangeSummary(events: RunEvent[]) {
  const byPath = new Map<string, { path: string; type: RunEvent["type"]; adds: number; dels: number }>();
  for (const event of events) {
    if (event.type !== "file_created" && event.type !== "file_changed" && event.type !== "file_deleted") continue;
    const { path, adds, dels } = parseFileChange(event);
    byPath.set(path, { path, type: event.type, adds, dels });
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function computeFileTotals(events: RunEvent[]) {
  const files = fileChangeSummary(events);
  return {
    count: files.length,
    adds: files.reduce((sum, f) => sum + f.adds, 0),
    dels: files.reduce((sum, f) => sum + f.dels, 0)
  };
}

function formatRunDuration(run: Run | null, now: number, text: { elapsedSeconds: string }) {
  if (!run?.createdAt) return "";
  const start = Date.parse(run.createdAt);
  const end = run.completedAt ? Date.parse(run.completedAt) : now;
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec} ${text.elapsedSeconds}`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

// Claude tarzı "2 dosya düzenlendi · İncele · Geri Al" inline kartı.
function FileChangeBundle({
  files,
  language,
  onOpenFile
}: {
  files: RunEvent[];
  language: Language;
  onOpenFile?: (path: string) => void;
}) {
  const text = uiText[language];
  const [open, setOpen] = useState(true);
  const list = fileChangeSummary(files);
  const totalAdds = list.reduce((sum, f) => sum + f.adds, 0);
  const totalDels = list.reduce((sum, f) => sum + f.dels, 0);
  return (
    <div className="fileBundleCard">
      <div className="fileBundleHead">
        <div className="fileBundleIcon">
          <Diamond size={14} />
        </div>
        <div className="fileBundleTitle">
          <strong>{list.length} {text.fileEditedNoun}</strong>
          <span className="fileBundleStat">
            <span className="diffAdd">+{totalAdds}</span> <span className="diffDel">-{totalDels}</span>
          </span>
        </div>
        <span className="fileBundleSpacer" />
        <button className="fileBundleAction" onClick={() => setOpen((o) => !o)} title={text.review}>
          {text.review}
        </button>
      </div>
      {open && (
        <div className="fileBundleList">
          {list.map((file) => {
            const tag =
              file.type === "file_created" ? text.created :
              file.type === "file_deleted" ? text.deleted :
              text.changed;
            return (
              <button
                key={file.path}
                className={`fileBundleRow ${file.type}`}
                disabled={file.type === "file_deleted" || !onOpenFile}
                onClick={() => onOpenFile?.(file.path)}
                title={text.openFile}
              >
                <code>{file.path}</code>
                <span className="fileBundleRight">
                  {(file.adds > 0 || file.dels > 0) && (
                    <span className="fileBundleDiff">
                      <span className="diffAdd">+{file.adds}</span> <span className="diffDel">-{file.dels}</span>
                    </span>
                  )}
                  <span className="fileBundleTag">{tag}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline run durumu (started/agent_step/completed/failed) — küçük tek satır kart.
function RunStatusInline({ event, language }: { event: RunEvent; language: Language }) {
  const text = uiText[language];
  const tone =
    event.type === "failed" || event.type === "limit_detected" ? "danger" :
    event.type === "completed" ? "success" :
    event.type === "fallback_used" ? "warn" : "info";
  const label =
    event.type === "queued" ? text.waiting :
    event.type === "started" ? text.started :
    event.type === "agent_step" ? text.activity :
    event.type === "completed" ? text.finished :
    event.type === "failed" ? text.failedLabel :
    event.type === "limit_detected" ? text.limitDetected :
    event.type === "fallback_used" ? text.fallback :
    event.type;
  return (
    <div className={`runStatusInline ${tone}`}>
      <span className="runStatusInlineDot" />
      <strong>{label}</strong>
      <span className="runStatusInlineMsg">{event.agentId ? `${event.agentId}: ${event.message}` : event.message}</span>
      <time>{formatRunEventTime(event.createdAt)}</time>
    </div>
  );
}

function formatRunEventTime(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

const CollapsibleTerminalLine = ({ event }: { event: RunEvent }) => {
  const [open, setOpen] = useState(false);
  
  const formatTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      return `[${date.toTimeString().split(" ")[0]}]`;
    } catch {
      return "";
    }
  };

  const getBadgeClass = (agentId?: string | null) => {
    if (!agentId) return "system";
    const cleanId = agentId.toLowerCase();
    if (cleanId.includes("claude")) return "claude";
    if (cleanId.includes("codex")) return "codex";
    if (cleanId.includes("gemini") || cleanId.includes("agy") || cleanId.includes("antigravity")) return "antigravity";
    return "system";
  };

  const isStdoutOrStderr = event.type === "stdout" || event.type === "stderr";

  if (!isStdoutOrStderr || !event.rawOutput) {
    return (
      <div className={`terminalLine ${event.type}`}>
        <span className="time">{formatTime(event.createdAt)}</span>
        <span className={`badge ${getBadgeClass(event.agentId)}`}>
          {event.agentId || "system"}
        </span>
        <span>{event.message}</span>
      </div>
    );
  }

  return (
    <div className={`terminalLine ${event.type} collapsible`} onClick={() => setOpen(!open)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span className="time">{formatTime(event.createdAt)}</span>
          <span className={`badge ${getBadgeClass(event.agentId)}`}>
            {event.agentId || "system"}
          </span>
          <span>{event.message.slice(0, 90)}{event.message.length > 90 ? "..." : ""}</span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>
      {open && (
        <pre className="terminalRawCode" onClick={(e) => e.stopPropagation()}>
          <code>{event.rawOutput}</code>
        </pre>
      )}
    </div>
  );
};

function actionLabel(action: "login" | "logout" | "test", language: Language) {
  const text = uiText[language];
  if (action === "login") return text.login.toLowerCase();
  if (action === "logout") return text.logout.toLowerCase();
  return text.test.toLowerCase();
}

function roleLabel(role: AgentRole, language: Language) {
  const text = uiText[language];
  if (role === "planner") return text.planner;
  if (role === "builder") return text.builder;
  if (role === "reviewer") return text.reviewer;
  if (role === "fixer") return text.fixer;
  return text.custom;
}

// ─────────── File Explorer ───────────

type FileEntry = { name: string; path: string; type: "file" | "dir"; size?: number };

function FileExplorer({
  language,
  onOpenFile,
  rootPath,
  refreshKey = 0
}: {
  language: Language;
  onOpenFile: (path: string) => void;
  rootPath: string | null;
  refreshKey?: number;
}) {
  const text = uiText[language];
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState(Boolean(rootPath));

  const loadDir = useCallback(async (dirPath?: string) => {
    const target = dirPath ?? rootPath;
    if (!target) return [];
    const url = `/api/files?path=${encodeURIComponent(target)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries: FileEntry[] };
    return data.entries;
  }, [rootPath]);

  useEffect(() => {
    setExpanded({});
    if (!rootPath) {
      setRootEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadDir().then((entries) => { setRootEntries(entries); setLoading(false); }).catch(() => setLoading(false));
  }, [loadDir, rootPath, refreshKey]);

  const toggleDir = useCallback(async (dirPath: string) => {
    if (expanded[dirPath]) {
      setExpanded((prev) => { const next = { ...prev }; delete next[dirPath]; return next; });
    } else {
      const children = await loadDir(dirPath);
      setExpanded((prev) => ({ ...prev, [dirPath]: children }));
    }
  }, [expanded, loadDir]);

  const renderEntries = (entries: FileEntry[], depth: number): React.ReactNode =>
    entries.map((entry) => {
      const isOpen = Boolean(expanded[entry.path]);
      return (
        <div key={entry.path}>
          <button
            className={`explorerRow ${entry.type}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => entry.type === "dir" ? void toggleDir(entry.path) : onOpenFile(entry.path)}
          >
            {entry.type === "dir" ? (
              <>
                <ChevronRight size={12} className={`explorerChevron${isOpen ? " open" : ""}`} />
                {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
              </>
            ) : (
              <>
                <span style={{ width: 12 }} />
                <FileIcon size={14} />
              </>
            )}
            <span className="explorerName">{entry.name}</span>
          </button>
          {isOpen && expanded[entry.path] && renderEntries(expanded[entry.path], depth + 1)}
        </div>
      );
    });

  return (
    <section className="glassPanel fileExplorer">
      <div className="panelTitle split">
        <span>
          <Folder size={15} />
          {text.explorer}
        </span>
        <button
          className="iconButton"
          disabled={!rootPath}
          onClick={() => { setLoading(true); loadDir().then((e) => { setRootEntries(e); setLoading(false); }); }}
          title={text.refresh}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="explorerBody">
        {!rootPath ? (
          <div className="explorerEmpty">
            <Folder size={22} />
            <strong>{text.noWorkspace}</strong>
            <span>{text.noWorkspaceDesc}</span>
          </div>
        ) : loading ? (
          <small style={{ padding: "8px", opacity: 0.6 }}>{text.readingCli}</small>
        ) : (
          renderEntries(rootEntries, 0)
        )}
      </div>
    </section>
  );
}

// ─────────── Code Chat Panel (compact) ───────────

function FileDialog({
  language,
  rootPath,
  refreshKey,
  tabs,
  activePath,
  onOpenFile,
  onSelect,
  onCloseTab,
  onClose
}: {
  language: Language;
  rootPath: string | null;
  refreshKey: number;
  tabs: OpenFileTab[];
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onClose: () => void;
}) {
  const text = uiText[language];
  const activeTab = tabs.find((tab) => tab.path === activePath) ?? tabs[0];

  return (
    <div className="fileDialogOverlay" onMouseDown={onClose}>
      <div className="fileDialog" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="fileDialogExplorer">
          <FileExplorer language={language} rootPath={rootPath} refreshKey={refreshKey} onOpenFile={onOpenFile} />
        </aside>
        <section className="fileDialogMain">
          <div className="fileDialogHeader">
            <div className="fileTabs">
              {tabs.map((tab) => (
                <button
                  className={`fileTab${tab.path === activeTab?.path ? " active" : ""}`}
                  key={tab.path}
                  onClick={() => onSelect(tab.path)}
                  title={tab.path}
                >
                  <FileIcon size={13} />
                  <span>{tab.name}</span>
                  <X
                    size={13}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.path);
                    }}
                  />
                </button>
              ))}
            </div>
            <button className="iconButton" onClick={onClose} title={text.close}>
              <X size={16} />
            </button>
          </div>
          {activeTab ? (
            <pre className="fileDialogContent"><code>{activeTab.content}</code></pre>
          ) : (
            <div className="previewEmpty">
              <FileIcon size={36} />
              <h4>{text.fileViewer}</h4>
              <p>{text.openFile}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function IntegratedTerminal({
  language,
  open,
  sessions,
  activeId,
  outputs,
  onToggle,
  onCreate,
  onClose,
  onSelect,
  onInput
}: {
  language: Language;
  open: boolean;
  sessions: TerminalSessionInfo[];
  activeId: string | null;
  outputs: Record<string, string>;
  onToggle: () => void;
  onCreate: (shell: "powershell" | "cmd") => void;
  onClose: (id: string) => void;
  onSelect: (id: string) => void;
  onInput: (id: string, value: string) => void;
}) {
  const text = uiText[language];
  const [command, setCommand] = useState("");
  const outputRef = useRef<HTMLPreElement | null>(null);
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [outputs, active?.id]);

  if (!open) {
    return (
      <button className="terminalCollapsed" onClick={onToggle} title={text.toggleTerminal}>
        <Terminal size={15} />
        <span>{text.terminal}</span>
        <kbd>Ctrl+"</kbd>
      </button>
    );
  }

  return (
    <section className="integratedTerminal">
      <div className="terminalTopbar">
        <div className="terminalTabs">
          {sessions.map((session) => (
            <button
              className={`terminalTab${session.id === active?.id ? " active" : ""}`}
              key={session.id}
              onClick={() => onSelect(session.id)}
            >
              <SquareTerminal size={13} />
              <span>{session.name}</span>
              <X
                size={12}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(session.id);
                }}
              />
            </button>
          ))}
        </div>
        <div className="terminalActions">
          <button onClick={() => onCreate("powershell")}>{text.newPowerShell}</button>
          <button onClick={() => onCreate("cmd")}>{text.newCmd}</button>
          <button className="iconButton" onClick={onToggle} title={text.closeTerminal}>
            <X size={14} />
          </button>
        </div>
      </div>
      {active ? (
        <>
          <pre ref={outputRef} className="integratedTerminalOutput">{outputs[active.id] || ""}</pre>
          <form
            className="terminalInputRow"
            onSubmit={(event) => {
              event.preventDefault();
              const value = command.trimEnd();
              if (!value) return;
              onInput(active.id, value);
              setCommand("");
            }}
          >
            <span>{active.shell === "cmd" ? "cmd>" : "PS>"}</span>
            <input
              value={command}
              placeholder={text.terminalPlaceholder}
              onChange={(event) => setCommand(event.target.value)}
            />
          </form>
        </>
      ) : (
        <div className="terminalEmpty">
          <SquareTerminal size={28} />
          <p>{text.noTerminal}</p>
        </div>
      )}
    </section>
  );
}

function CodeChatPanel({
  language, messages, value, selectedPlanner, selectedModel, modelOptions,
  selectedEffort, onEffortChange, selectedDetailLevel, onDetailLevelChange,
  mode, onModeChange, multiAvailable, cliOptions, singleCli, onSingleCliChange,
  thinking, onModelChange, onChange, onSend, onClear, onCreateBrief, onCreatePlan, onStart,
  runActive, onAddNote, onStopRun,
  attachments, onAddImage, onRemoveImage,
  conversations, activeConversationId, onOpenConversation, onDeleteConversation, onNewChat,
  run, events, onOpenFile, onTogglePreview, previewOpen
}: {
  language: Language;
  messages: ChatMessage[];
  value: string;
  selectedPlanner: PlannerChoice;
  selectedModel: string;
  modelOptions: ModelOption[];
  selectedEffort: "low" | "medium" | "high";
  onEffortChange: (e: "low" | "medium" | "high") => void;
  selectedDetailLevel: "low" | "medium" | "high";
  onDetailLevelChange: (e: "low" | "medium" | "high") => void;
  mode: ChatMode;
  onModeChange: (m: ChatMode) => void;
  multiAvailable: boolean;
  cliOptions: DebateParticipant[];
  singleCli: DebateParticipant;
  onSingleCliChange: (id: DebateParticipant) => void;
  thinking: boolean;
  onModelChange: (m: string) => void;
  onChange: (v: string) => void;
  onSend: (t?: string) => void;
  onClear: () => void;
  onCreateBrief: () => void;
  onCreatePlan: () => void;
  onStart: () => void;
  runActive: boolean;
  onAddNote: (note: string) => void;
  onStopRun: () => void;
  attachments: { path: string; name: string; preview: string }[];
  onAddImage: (file: File) => void;
  onRemoveImage: (path: string) => void;
  conversations: StoredConversation[];
  activeConversationId: string;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewChat: () => void;
  run: Run | null;
  events: RunEvent[];
  onOpenFile?: (path: string) => void;
  onTogglePreview: () => void;
  previewOpen: boolean;
}) {
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];
  const modeMeta = modeMetaByLanguage[language];
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Date.now());
  const voiceSupported = typeof window !== "undefined" && Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = language === "tr" ? "tr-TR" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0]?.transcript ?? "").join(" ").trim();
      if (transcript) onChange(value.trim() ? `${value.trim()} ${transcript}` : transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, events.length, thinking]);

  // Aktif run varsa süre sayacını canlı tut.
  useEffect(() => {
    if (run && run.status === "running") {
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [run?.status, run?.id]);

  const runDuration = formatRunDuration(run, now, text);
  const fileTotals = computeFileTotals(events);

  return (
    <section className="codeChatPanel glassPanel">
      <div className="codeChatHeader">
        <div className="panelTitle">
          <MessageCircle size={15} />
          <span>{text.codeChat}</span>
          <strong>{plannerLabels[selectedPlanner]}</strong>
        </div>
        <div className="codeChatTools">
          <button className="ghostButton" onClick={onNewChat} title={text.newChat}>
            <Plus size={13} />
            {text.new}
          </button>
          <button className="ghostButton" onClick={() => setShowHistory(true)} title={text.history}>
            <History size={13} />
            {text.history}
          </button>
          <button className="ghostButton" onClick={onTogglePreview} title={text.togglePreview}>
            {previewOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            {text.preview}
          </button>
          <button className="ghostButton" onClick={onClear} title={text.clearChat}>{text.clear}</button>
          <button className="ghostButton" onClick={onCreateBrief} title={text.createBrief}>
            <FileText size={13} />
            Brief
          </button>
          <button className="ghostButton" onClick={onCreatePlan} title={text.teamPlanTitle}>
            <Users size={13} />
            {text.teamPlan}
          </button>
          {runActive && (
            <button className="ghostButton stopButton" onClick={onStopRun} title={text.stop}>
              <X size={13} />
              {text.stop}
            </button>
          )}
          <button className="ghostButton startButton" onClick={onStart} title={text.startRunTitle}>
            <Play size={13} />
            {text.startRun}
          </button>
        </div>
      </div>

      {run && (
        <div className={`runBanner status-${run.status}`}>
          <div className="runBannerMain">
            <span className={`runBannerDot ${run.status}`} />
            <strong>{run.activeStep || run.status}</strong>
            <span className="runBannerMeta">{runDuration}</span>
            {fileTotals.count > 0 && (
              <span className="runBannerMeta">
                {fileTotals.count} {text.fileEditedNoun} · <span className="diffAdd">+{fileTotals.adds}</span> <span className="diffDel">-{fileTotals.dels}</span>
              </span>
            )}
          </div>
          <button
            className="runBannerBriefBtn"
            onClick={() => setBriefOpen((open) => !open)}
            title={text.briefShartname}
          >
            {briefOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Brief
          </button>
        </div>
      )}
      {run && briefOpen && (
        <div className="runBriefInline">
          <pre>{run.prompt}</pre>
        </div>
      )}

      <div className="codeChatMessages">
        {messages.map((msg) => (
          <article key={msg.id ?? `${msg.role}-${msg.createdAt}`} className={`chatBubble ${msg.role} compact`}>
            {msg.role === "assistant" && (
              <div className="messageMeta">
                <Bot size={12} />
                <span>{msg.modelLabel ?? "Orkestra"}</span>
              </div>
            )}
            <pre>{msg.content}</pre>
          </article>
        ))}
        {run && <AgentActivitySection events={events} language={language} onOpenFile={onOpenFile} />}
        {thinking && (
          <article className="chatBubble assistant thinking compact">
            <div className="typingDots"><span /><span /><span /></div>
          </article>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="codeChatComposer">
        <div className="codeChatComposerRow">
          <div className="modeSwitch compact">
            {(["single", "multi", "debate"] as ChatMode[]).map((item) => {
              const disabled = item !== "single" && !multiAvailable;
              return (
                <button
                  key={item}
                  className={`modeTab${mode === item ? " on" : ""}${item === "debate" ? " debate" : ""}`}
                  disabled={disabled}
                  onClick={() => onModeChange(item)}
                  title={modeMeta[item].desc}
                >
                  {item === "single" && <Bot size={13} />}
                  {item === "multi" && <Users size={13} />}
                  {item === "debate" && <Swords size={13} />}
                  {modeMeta[item].label}
                </button>
              );
            })}
          </div>
          {mode === "single" && (
            <select
              className="pill"
              value={cliOptions.includes(singleCli) ? singleCli : ""}
              disabled={!cliOptions.length}
              onChange={(e) => onSingleCliChange(e.target.value as DebateParticipant)}
            >
              {!cliOptions.length && <option value="">{text.noCli}</option>}
              {cliOptions.map((id) => <option key={id} value={id}>{plannerLabels[id]}</option>)}
            </select>
          )}
          {mode === "single" && (
            <select className="pill" value={selectedModel} onChange={(e) => onModelChange(e.target.value)}>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id} disabled={m.limited}>{m.label}{m.limited ? ` - ${text.limited}` : ""}</option>
              ))}
            </select>
          )}
          <select
            className="pill"
            value={selectedDetailLevel}
            title={text.detailLevelTitle}
            onChange={(e) => onDetailLevelChange(e.target.value as "low" | "medium" | "high")}
          >
            <option value="low">{text.detailLow}</option>
            <option value="medium">{text.detailMedium}</option>
            <option value="high">{text.detailHigh}</option>
          </select>
        </div>
        {attachments.length > 0 && (
          <div className="attachmentRow">
            {attachments.map((item) => (
              <div className="attachmentChip" key={item.path}>
                <img src={item.preview} alt={item.name} />
                <span>{item.name}</span>
                <button onClick={() => onRemoveImage(item.path)} title={text.removeAttachment}>
                  <X size={12} />
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
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach((file) => onAddImage(file));
            e.target.value = "";
          }}
        />
        <div className="codeChatInputRow">
          <button className="iconRound" onClick={() => fileInputRef.current?.click()} title={text.addImage}>
            <Plus size={16} />
          </button>
          <textarea
            className="codeChatInput"
            value={value}
            placeholder={runActive ? text.steeringPlaceholder : text.composerPlaceholder}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const images = Array.from(e.clipboardData.items)
                .filter((it) => it.type.startsWith("image/"))
                .map((it) => it.getAsFile())
                .filter((f): f is File => Boolean(f));
              if (images.length) {
                e.preventDefault();
                images.forEach((file) => onAddImage(file));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (runActive) {
                  if (value.trim()) { onAddNote(value); onChange(""); }
                } else onSend();
              }
            }}
            rows={2}
          />
          {voiceSupported && (
            <button className={`iconRound${listening ? " recording" : ""}`} onClick={toggleVoice} title={text.voiceInput}>
              <Mic size={16} />
            </button>
          )}
          {runActive ? (
            <button
              className="iconRound sendCircle"
              disabled={!value.trim()}
              onClick={() => { if (value.trim()) { onAddNote(value); onChange(""); } }}
              title={text.addNote}
            >
              <ArrowUp size={16} />
            </button>
          ) : (
            <button
              className="iconRound sendCircle"
              disabled={(!value.trim() && !attachments.length) || thinking || !cliOptions.length}
              onClick={() => onSend()}
              title={text.send}
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
      <HistoryDialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onOpenConversation={onOpenConversation}
        onDeleteConversation={onDeleteConversation}
        language={language}
      />
    </section>
  );
}

// ─────────── Browser Preview ───────────

function BrowserPreview({ run, language, onClose }: { run: Run | null; language: Language; onClose: () => void }) {
  const text = uiText[language];
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const serverOrigin = `${window.location.protocol}//${window.location.hostname}:8787`;
  const previewUrl = run ? `${serverOrigin}/preview/${run.id}/index.html` : null;

  useEffect(() => {
    let cancelled = false;
    if (!previewUrl) {
      setPreviewAvailable(false);
      return;
    }
    fetch(previewUrl, { cache: "no-store" })
      .then((response) => {
        if (!cancelled) setPreviewAvailable(response.ok);
      })
      .catch(() => {
        if (!cancelled) setPreviewAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewUrl, refreshKey]);

  return (
    <section className="glassPanel browserPreview">
      <div className="previewHeader">
        <div className="panelTitle">
          <Globe size={15} />
          <span>{text.preview}</span>
        </div>
        <div className="previewActions">
          {previewUrl && previewAvailable && (
            <>
              <button className="iconButton" onClick={() => setRefreshKey((k) => k + 1)} title={text.refreshPreview}>
                <RefreshCw size={13} />
              </button>
              <button className="iconButton" onClick={() => window.open(previewUrl, "_blank")} title={text.openInBrowser}>
                <ExternalLink size={13} />
              </button>
            </>
          )}
          <button className="iconButton" onClick={onClose} title={text.close}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="previewBody">
        {previewUrl && previewAvailable ? (
          <iframe key={refreshKey} src={previewUrl} className="previewFrame" title="Preview" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="previewEmpty">
            <Eye size={36} />
            <h4>{text.noPreview}</h4>
            <p>{text.noPreviewDesc}</p>
          </div>
        )}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

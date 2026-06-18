import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  FileText,
  CheckCircle2,
  ChevronRight,
  Target,
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
  MoreHorizontal,
  Copy,
  Code,
  Terminal,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Mic,
  PanelRightOpen,
  PanelRightClose,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
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
  Square,
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
    agentCenter: "Limit Management",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
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
    project: "Project",
    projects: "Projects",
    noProjectsDesc: "No projects yet. Create one or start from chat.",
    searchPlaceholder: "Search…",
    addModel: "Add Model",
    fuseWith: "Fuse with",
    operatorSelect: "Select operator",
    auto: "Auto",
    searchModels: "Search models…",
    noResults: "No results.",
    collapse: "Collapse",
    expand: "Expand",
    noSessionsYet: "No sessions yet.",
    untitled: "Untitled",
    chatHistoryTitle: "Past Chats",
    showMore: "Show more",
    projectNamePrompt: "Project name:",
    projectNamePlaceholder: "e.g. my-app",
    create: "Create",
    rename: "Rename",
    renameProject: "Rename project",
    renameProjectPrompt: "New project name (the real folder is renamed too):",
    activeProject: "Active project",
    noProjectYet: "No project (new)",
    newProject: "New project",
    newProjectTitle: "Start a fresh project (resets workspace)",
    newSessionTitle: "New session in this project",
    moreActions: "More",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project from the list? (files are not deleted)",
    openInExplorer: "Open folder in file manager",
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
    operatorAnalysis: "Operator Analysis",
    operator: "Operator",
    operatorNone: "No operator (summary)",
    operatorTitle: "Operator model that synthesizes the debate into a structured analysis",
    codeFromAnalysis: "Code from this analysis",
    operatorBuild: "Let operator build",
    teamWork: "Team work",
    debateDoneHint: "Debate finished. How should we proceed?",
    operatorAnalyzingLabel: "Operator is analyzing…",
    phaseDoneHint: "Phase complete — review and continue?",
    phaseContinue: "Continue to next phase",
    codingModeHint: "Coding mode — your message is an instruction to the agents (continue from where they left off), not a debate.",
    backToDebate: "Back to debate",
    backToDebateTitle: "Exit coding mode and discuss with the agents again",
    working: "Working…",
    teamWorkTitle: "Team Work — Division of Labor",
    teamWorkDesc: "No planner needed (the plan was made in the chat). Pick the coding agents and an optional reviewer.",
    reviewerAgent: "Reviewer (checks fit to purpose)",
    reviewerNone: "No reviewer",
    coders: "Coding agents",
    addCoder: "Add coder",
    scopeBackend: "Backend",
    scopeFrontend: "Frontend",
    scopeGeneral: "General",
    startTeamWork: "Start team work",
    noCodersYet: "No coders added yet.",
    pickAgent: "Pick agent",
    operatorBuildStarted: "Operator started building the project.",
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
    assignAgent: "Assign agent/model",
    assignByRole: "Auto (by role)",
    assignSpecificAgent: "Specific agent",
    taskInstruction: "Task / instruction (e.g. \"you build the backend and the database\")",
    statusIdle: "Idle",
    statusQueued: "Queued",
    statusRunning: "Running",
    statusCompleted: "Completed",
    statusFailed: "Failed",
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
    resizeTerminal: "Drag to resize",
    newTerminalTitle: "New terminal",
    copyMessage: "Copy",
    copied: "Copied",
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
    agentCenter: "Limit Yönetimi",
    collapseSidebar: "Paneli kapat",
    expandSidebar: "Paneli aç",
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
    project: "Proje",
    projects: "Projeler",
    noProjectsDesc: "Henüz proje yok. Oluştur ya da sohbetten başlat.",
    searchPlaceholder: "Ara…",
    addModel: "Model Ekle",
    fuseWith: "Birleştir",
    operatorSelect: "Operatör Seçimi",
    auto: "Otomatik",
    searchModels: "Model ara…",
    noResults: "Sonuç yok.",
    collapse: "Daralt",
    expand: "Genişlet",
    noSessionsYet: "Henüz oturum yok.",
    untitled: "Başlıksız",
    chatHistoryTitle: "Geçmiş Sohbetler",
    showMore: "Daha fazla göster",
    projectNamePrompt: "Proje adı:",
    projectNamePlaceholder: "örn. benim-uygulamam",
    create: "Oluştur",
    rename: "Yeniden adlandır",
    renameProject: "Projeyi yeniden adlandır",
    renameProjectPrompt: "Yeni proje adı (gerçek klasör de yeniden adlandırılır):",
    activeProject: "Aktif proje",
    noProjectYet: "Proje yok (yeni)",
    newProject: "Yeni Proje",
    newProjectTitle: "Sıfırdan yeni proje (workspace sıfırlanır)",
    newSessionTitle: "Bu projede yeni oturum",
    moreActions: "Daha fazla",
    deleteProject: "Projeyi sil",
    deleteProjectConfirm: "Bu proje listeden silinsin mi? (dosyalar silinmez)",
    openInExplorer: "Klasörü dosya yöneticisinde aç",
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
    operatorAnalysis: "Operatör Analizi",
    operator: "Operatör",
    operatorNone: "Operatör yok (özet)",
    operatorTitle: "Tartışmayı yapılandırılmış analize çeviren operatör modeli",
    codeFromAnalysis: "Bu analize göre kodla",
    operatorBuild: "Operatöre Projeyi Yaptır",
    teamWork: "Ekip Çalışması",
    debateDoneHint: "Tartışma bitti. Nasıl ilerleyelim?",
    operatorAnalyzingLabel: "Operatör analiz ediyor…",
    phaseDoneHint: "Faz tamamlandı — inceleyip devam edelim mi?",
    phaseContinue: "Sıradaki faza devam et",
    codingModeHint: "Kodlama modu — mesajın ajana TALİMAT olur (kaldığı yerden devam), tartışma açmaz.",
    backToDebate: "Tartışmaya dön",
    backToDebateTitle: "Kodlama modundan çık, ajanlarla tekrar tartış",
    working: "Çalışıyor…",
    teamWorkTitle: "Ekip Çalışması — İş Bölümü",
    teamWorkDesc: "Planlayıcı yok (plan sohbette yapıldı). Kod yazacak ajanları ve isteğe bağlı bir denetçiyi seç.",
    reviewerAgent: "Denetçi (amaca uygunluğu kontrol eder)",
    reviewerNone: "Denetçi yok",
    coders: "Kod yazacak ajanlar",
    addCoder: "Ajan ekle",
    scopeBackend: "Backend",
    scopeFrontend: "Frontend",
    scopeGeneral: "Genel",
    startTeamWork: "Ekip çalışmasını başlat",
    noCodersYet: "Henüz ajan eklenmedi.",
    pickAgent: "Ajan seç",
    operatorBuildStarted: "Operatör projeyi yapmaya başladı.",
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
    assignAgent: "Ajan/model ata",
    assignByRole: "Otomatik (role göre)",
    assignSpecificAgent: "Belirli ajan",
    taskInstruction: "Görev / talimat (ör. \"backend'i ve veritabanını sen yap\")",
    statusIdle: "Beklemede",
    statusQueued: "Sırada",
    statusRunning: "Çalışıyor",
    statusCompleted: "Tamamlandı",
    statusFailed: "Hata",
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
    resizeTerminal: "Sürükleyerek boyutlandır",
    newTerminalTitle: "Yeni terminal",
    copyMessage: "Kopyala",
    copied: "Kopyalandı",
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

type StoredConversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: string; workspacePath?: string | null; projectId?: string | null; codingActive?: boolean; phasePendingRunId?: string | null };
// Proje: kalıcı bir kod tabanı/klasör. Her projenin kendi oturum (konuşma) geçmişi olur.
type Project = { id: string; name: string; workspacePath: string; createdAt: string };
type TextPromptState = {
  title: string;
  placeholder?: string;
  initial: string;
  confirmLabel: string;
  resolve: (value: string | null) => void;
};
const PROJECTS_KEY = "orkestra.projects";
// Chat ve Code sekmelerinin geçmişleri ayrı saklanır.
const CHAT_CONVERSATIONS_KEY = "orkestra.conversations.chat";
const CODE_CONVERSATIONS_KEY = "orkestra.conversations.code";

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Project[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
  // Proje katmanı: projeler listesi + aktif proje. Her projenin kendi oturum geçmişi var.
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    () => localStorage.getItem("orkestra.activeProjectId") || null
  );
  useEffect(() => {
    if (activeProjectId) localStorage.setItem("orkestra.activeProjectId", activeProjectId);
    else localStorage.removeItem("orkestra.activeProjectId");
  }, [activeProjectId]);
  function persistProjects(next: Project[]) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  }
  // Chat ve Code geçmişleri ayrı: mesajlar, konuşma listesi ve aktif id ayrı tutulur.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [welcomeMessageFor(language)]);
  const [codeMessages, setCodeMessages] = useState<ChatMessage[]>(() => [welcomeMessageFor(language)]);
  const [chatConvos, setChatConvos] = useState<StoredConversation[]>([]);
  const [codeConvos, setCodeConvos] = useState<StoredConversation[]>([]);
  const [chatConvoId, setChatConvoId] = useState<string>(() => crypto.randomUUID());
  const [codeConvoId, setCodeConvoId] = useState<string>(() => crypto.randomUUID());
  // Async analizin doğru oturuma yazılması için codeConvoId'i ref'te de tut (closure güncel kalsın).
  const codeConvoIdRef = useRef(codeConvoId);
  useEffect(() => { codeConvoIdRef.current = codeConvoId; }, [codeConvoId]);

  // Aktif sekmeye göre türetilmiş alias'lar — gerisi değişmeden çalışır.
  const isCodeView = activeView === "code";
  const messages = isCodeView ? codeMessages : chatMessages;
  const setMessages = isCodeView ? setCodeMessages : setChatMessages;
  const conversations = isCodeView ? codeConvos : chatConvos;
  const setConversations = isCodeView ? setCodeConvos : setChatConvos;
  const conversationId = isCodeView ? codeConvoId : chatConvoId;
  const setConversationId = isCodeView ? setCodeConvoId : setChatConvoId;

  const [chatInput, setChatInput] = useState("");
  const [attachments, setAttachments] = useState<{ path: string; name: string; preview: string; isImage: boolean }[]>([]);
  const [selectedEffort, setSelectedEffort] = useState<"low" | "medium" | "high">("low");
  const [selectedDetailLevel, setSelectedDetailLevel] = useState<"low" | "medium" | "high">("high");
  // Paralel/Tartışma katılımcıları: aynı CLI'den farklı modeller ayrı katılımcı olabilir.
  const [participants, setParticipants] = useState<{ cli: DebateParticipant; model: string }[]>([]);
  const [debateRounds, setDebateRounds] = useState(1);
  // Operatör (Code tartışma): tartışmayı 5 başlıklı analize çeviren model. null = klasik özet.
  const [operatorSel, setOperatorSel] = useState<{ cli: DebateParticipant; model: string } | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);
  // Faz onayı bekleyen run id'si (faz bitti, kullanıcı "devam et" demeli).
  const [phasePending, setPhasePending] = useState<string | null>(null);
  // Kodlama modu: bir kez kodlama başlayınca mesajlar tartışma DEĞİL, ajana TALİMAT olur
  // (kaldığı yerden devam). "Tartışmaya dön" ile çıkılır. Proje bazlı kalıcı.
  const [codingActive, setCodingActive] = useState(false);
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
  // Sol panel (sidebar) aç/kapa — ChatGPT tarzı; tercih localStorage'da saklanır.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => localStorage.getItem("orkestra.sidebarCollapsed") === "1");
  useEffect(() => {
    localStorage.setItem("orkestra.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  // Temalı metin giriş modalı (window.prompt yerine). Promise tabanlı: askText() açar, kullanıcı onaylayınca çözer.
  const [textPrompt, setTextPrompt] = useState<TextPromptState | null>(null);
  const askText = useCallback(
    (opts: { title: string; placeholder?: string; initial?: string; confirmLabel: string }) =>
      new Promise<string | null>((resolve) => {
        setTextPrompt({ ...opts, initial: opts.initial ?? "", resolve });
      }),
    []
  );
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [briefMeta, setBriefMeta] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planTasks, setPlanTasks] = useState<PlanTask[]>([]);
  const [planMeta, setPlanMeta] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  // Code modunda tartışma bitince analiz + 3 aksiyon barı gösterilir.
  const [codeDebateDone, setCodeDebateDone] = useState(false);
  // Operatör analizi sürerken gösterge (model etiketi); analiz gelince null.
  const [operatorAnalyzing, setOperatorAnalyzing] = useState<string | null>(null);
  // Bir tartışma için analizin bir kez tetiklendiğini izler (her yeni tartışmada sıfırlanır).
  const analysisFiredRef = useRef(false);
  const [showPreview, setShowPreview] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [openFileTabs, setOpenFileTabs] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  // Terminal kolon genişliği (yatay sürükleyerek değiştirilebilir).
  const [terminalWidth, setTerminalWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem("orkestra.terminalWidth"));
    return saved >= 300 && saved <= 820 ? saved : 440;
  });
  useEffect(() => {
    localStorage.setItem("orkestra.terminalWidth", String(terminalWidth));
  }, [terminalWidth]);
  // Sürükleme sırasında grid geçişini kapatıp kasmayı önlemek için.
  const [terminalResizing, setTerminalResizing] = useState(false);
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

  // Önizleme butonu yalnızca çalıştırılabilir bir giriş HTML'i (index.html vb.) bulununca görünür.
  const [previewAvailable, setPreviewAvailable] = useState(false);
  useEffect(() => {
    if (!activeRun) {
      setPreviewAvailable(false);
      return;
    }
    let cancelled = false;
    const host = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
    const origin = `${window.location.protocol}//${host}:8787`;
    fetch(`${origin}/preview-entry/${activeRun.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entry?: string } | null) => {
        if (!cancelled) setPreviewAvailable(Boolean(data?.entry));
      })
      .catch(() => {
        if (!cancelled) setPreviewAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRun?.id, workspaceFileEventCount]);

  // Önizlenecek dosya yoksa açık önizlemeyi kapat.
  useEffect(() => {
    if (!previewAvailable) setShowPreview(false);
  }, [previewAvailable]);

  // The planner sent to the API is derived from the active mode.
  const selectedPlanner: PlannerChoice = mode === "multi" ? "all" : mode === "debate" ? "debate" : singleCli;

  // Katılımcılar OTOMATİK gelmez — kullanıcı "Model Ekle" ile seçer. Geçersizleri ayıkla.
  useEffect(() => {
    setParticipants((current) => {
      const validClis = verifiedTools.map((tool) => tool.id as DebateParticipant);
      return current.filter((p) => validClis.includes(p.cli));
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

  // Tek Ajan: model "default" yerine seçili CLI'nin EN GELİŞMİŞ (ilk isimli) modeli gelsin.
  useEffect(() => {
    const src = participantSources.find((s) => s.cli === singleCli);
    if (!src) return;
    const valid = src.models.some((m) => m.id === selectedModel && m.id !== "default" && !m.limited);
    if (!valid) {
      const named = src.models.filter((m) => m.id !== "default");
      const best = named.find((m) => !m.limited) ?? named[0];
      setSelectedModel(best ? best.id : "default");
    }
  }, [singleCli, participantSources]);

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

  // Operatör analizini tartışma bitince TAZE messages'tan tetikler. streamDebate'in iç
  // değişkenlerine/closure'ına bağlı değil → en güvenilir yol. Tartışma başına bir kez.
  useEffect(() => {
    if (!codeDebateDone || activeView !== "code") return;
    if (analysisFiredRef.current) return; // tartışma başına bir kez (sendChat'te sıfırlanır)
    const turns = codeMessages
      .filter((m) => m.role === "assistant" && m.planner !== "analysis" && m.planner !== "system" && m.content.trim())
      .map((m) => ({ cli: m.planner, modelLabel: m.modelLabel, content: m.content }));
    if (!turns.length) return;
    analysisFiredRef.current = true;
    const topic = [...codeMessages].reverse().find((m) => m.role === "user")?.content ?? "proje";
    // 2. turda da çalışır: fetchOperatorAnalysis eski analiz kartını kaldırıp yenisini ekler.
    void fetchOperatorAnalysis(topic, turns);
  }, [codeDebateDone, codeMessages, activeView]);

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
    setConvos: React.Dispatch<React.SetStateAction<StoredConversation[]>>,
    workspacePath?: string | null,
    projectId?: string | null,
    coding?: boolean,
    phaseRunId?: string | null
  ) {
    if (!msgs.some((message) => message.role === "user")) return;
    setConvos((current) => {
      // Proje bazlı: kod konuşmasının workspace yolunu ve projesini sakla (yoksa eskisini koru).
      const prev = current.find((item) => item.id === id);
      const convo: StoredConversation = {
        id,
        title: deriveTitle(msgs),
        messages: msgs,
        updatedAt: new Date().toISOString(),
        workspacePath: workspacePath ?? prev?.workspacePath ?? null,
        projectId: projectId ?? prev?.projectId ?? null,
        codingActive: coding ?? prev?.codingActive ?? false,
        phasePendingRunId: phaseRunId !== undefined ? phaseRunId : prev?.phasePendingRunId ?? null
      };
      const next = [convo, ...current.filter((item) => item.id !== id)];
      saveConversations(key, next);
      return next;
    });
  }

  useEffect(() => {
    persistConvo(CHAT_CONVERSATIONS_KEY, chatMessages, chatConvoId, setChatConvos);
  }, [chatMessages, chatConvoId]);

  useEffect(() => {
    persistConvo(CODE_CONVERSATIONS_KEY, codeMessages, codeConvoId, setCodeConvos, projectWorkspace, activeProjectId, codingActive, phasePending);
  }, [codeMessages, codeConvoId, projectWorkspace, activeProjectId, codingActive, phasePending]);

  // "Yeni" = aktif PROJE içinde yeni oturum (workspace korunur, dosya gezgini aynı projede kalır).
  function newChat() {
    setMessages([welcomeMessageFor(language)]);
    setSuggestedPrompt(null);
    setAttachments([]);
    setNotice(null);
    setCodeDebateDone(false);
    setLastAnalysis(null);
    setPhasePending(null);
    setCodingActive(false); // yeni oturum tartışmayla başlar
    setConversationId(crypto.randomUUID());
    if (isCodeView) {
      setActiveRun(null);
      setEvents([]);
      // projectWorkspace + activeProjectId korunur → yeni oturum aynı projede açılır.
    }
  }

  // Yeni PROJE: aktif proje/workspace sıfırlanır, yeni boş oturum açılır.
  function newProject() {
    setActiveProjectId(null);
    setProjectWorkspace(null);
    setActiveRun(null);
    setEvents([]);
    setMessages([welcomeMessageFor(language)]);
    setSuggestedPrompt(null);
    setAttachments([]);
    setNotice(null);
    setCodeDebateDone(false);
    setLastAnalysis(null);
    setPhasePending(null);
    setCodingActive(false);
    setConversationId(crypto.randomUUID());
  }

  // Var olan bir projeye geç: workspace + oturum geçmişi o projeye döner.
  function switchProject(id: string) {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    setActiveProjectId(id);
    setProjectWorkspace(proj.workspacePath);
    setActiveRun(null);
    setEvents([]);
    setCodeDebateDone(false);
    setLastAnalysis(null);
    // Projenin en güncel oturumunu aç; yoksa yeni boş oturum.
    const sessions = codeConvos.filter((c) => c.projectId === id);
    if (sessions.length) {
      const latest = sessions[0];
      setCodeMessages(latest.messages.length ? latest.messages : [welcomeMessageFor(language)]);
      setCodeConvoId(latest.id);
      setCodingActive(Boolean(latest.codingActive));
      void restorePendingPhase(latest.phasePendingRunId); // bekleyen faz varsa "devam et" geri gelsin
    } else {
      setCodeMessages([welcomeMessageFor(language)]);
      setCodeConvoId(crypto.randomUUID());
      setCodingActive(false);
      setPhasePending(null);
    }
  }

  // Belirli projede YENİ boş oturum aç (proje paneli "+").
  function newSessionInProject(projectId: string) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setActiveProjectId(projectId);
    setProjectWorkspace(proj.workspacePath);
    setActiveRun(null);
    setEvents([]);
    setCodeMessages([welcomeMessageFor(language)]);
    setCodeConvoId(crypto.randomUUID());
    setCodingActive(false);
    setCodeDebateDone(false);
    setLastAnalysis(null);
    setPhasePending(null);
  }

  function deleteProject(id: string) {
    setProjects((cur) => {
      const next = cur.filter((p) => p.id !== id);
      persistProjects(next);
      return next;
    });
    if (activeProjectId === id) newProject();
  }

  // Sol panelden manuel proje klasörü oluştur (gerçek dizin) ve ona geç.
  async function createProject() {
    const name = await askText({ title: text.projectNamePrompt, placeholder: text.projectNamePlaceholder, initial: "", confirmLabel: text.create });
    if (name === null || !name.trim()) return;
    try {
      const res = await api.post<{ workspacePath: string; name: string }>("/api/projects/create", { name: name.trim() });
      const proj: Project = { id: crypto.randomUUID(), name: res.name, workspacePath: res.workspacePath, createdAt: new Date().toISOString() };
      setProjects((cur) => {
        const next = [proj, ...cur];
        persistProjects(next);
        return next;
      });
      setActiveProjectId(proj.id);
      setProjectWorkspace(proj.workspacePath);
      setActiveRun(null);
      setEvents([]);
      setCodeMessages([welcomeMessageFor(language)]);
      setCodeConvoId(crypto.randomUUID());
      setCodingActive(false);
      setCodeDebateDone(false);
      setLastAnalysis(null);
      setPhasePending(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  // Projeyi yeniden adlandır — GERÇEK klasör de yeniden adlandırılır (backend renameSync).
  async function renameProject(id: string) {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const newName = await askText({ title: text.renameProjectPrompt, placeholder: text.projectNamePlaceholder, initial: proj.name, confirmLabel: text.rename });
    if (newName === null || !newName.trim() || newName.trim() === proj.name) return;
    try {
      const res = await api.post<{ workspacePath: string; name: string }>("/api/projects/rename", {
        path: proj.workspacePath,
        newName: newName.trim()
      });
      const oldPath = proj.workspacePath;
      setProjects((cur) => {
        const next = cur.map((p) => (p.id === id ? { ...p, name: res.name, workspacePath: res.workspacePath } : p));
        persistProjects(next);
        return next;
      });
      // Eski yola bağlı oturumların workspace'ini güncelle.
      setCodeConvos((cur) => {
        const next = cur.map((c) => (c.workspacePath === oldPath ? { ...c, workspacePath: res.workspacePath } : c));
        saveConversations(CODE_CONVERSATIONS_KEY, next);
        return next;
      });
      if (activeProjectId === id) setProjectWorkspace(res.workspacePath);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  function openConversation(id: string) {
    const convo = conversations.find((item) => item.id === id);
    if (!convo) return;
    setMessages(convo.messages.length ? convo.messages : [welcomeMessageFor(language)]);
    setConversationId(id);
    setSuggestedPrompt(null);
    setAttachments([]);
    setCodeDebateDone(false);
    // Proje bazlı: kod oturumuna dönünce o projenin workspace + projesi + kodlama modu geri yüklenir.
    if (isCodeView) {
      setProjectWorkspace(convo.workspacePath ?? null);
      setActiveProjectId(convo.projectId ?? null);
      setCodingActive(Boolean(convo.codingActive));
      setActiveRun(null);
      setEvents([]);
      void restorePendingPhase(convo.phasePendingRunId); // bekleyen faz varsa "devam et" geri gelsin
    }
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
      // Durum olaylarını activeRun'a yansıt (yoksa stop butonu açık kalır, banner "queued" donar).
      if (event.type === "started") {
        setActiveRun((cur) => (cur && cur.id === event.runId ? { ...cur, status: "running", activeStep: event.message } : cur));
      }
      if (event.type === "agent_step") {
        setActiveRun((cur) => (cur && cur.id === event.runId ? { ...cur, activeStep: event.message } : cur));
      }
      // Faz bitti → raporu chat'e ekle + "devam et" butonunu göster (run hâlâ çalışıyor, onay bekliyor).
      if (event.type === "phase_done") {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", planner: "system", modelLabel: "Orkestra", content: event.message, createdAt: new Date().toISOString() }
        ]);
        setPhasePending(event.runId);
      }
      // ÖNEMLİ: ajan-bazlı completed/failed (agentId dolu) RUN'ı bitirmez — sadece o ajan bitti.
      // Run'ın gerçekten bittiği, agentId'siz (run-seviyesi) completed/failed olayıdır.
      const isRunLevel = !event.agentId;
      if ((event.type === "completed" || event.type === "failed") && isRunLevel) {
        // Duraklatma (⏸️) gerçek hata DEĞİL — "devam et" butonu (phasePending) korunur.
        const paused = event.type === "failed" && /⏸️|[Dd]uraklat/.test(event.message ?? "");
        if (!paused) setPhasePending(null);
        else setPhasePending(event.runId);
        setActiveRun((cur) =>
          cur && cur.id === event.runId
            ? { ...cur, status: event.type === "completed" ? "completed" : "failed", activeStep: event.type, completedAt: new Date().toISOString() }
            : cur
        );
        void refresh();
      }
    };
    return () => source.close();
  }, [activeRun?.id]);

  // Run bitince/başarısız olunca chat'te kısa bir rapor mesajı (etkileşim için).
  const reportedRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeRun || (activeRun.status !== "completed" && activeRun.status !== "failed")) return;
    const key = `${activeRun.id}-${activeRun.status}`;
    if (reportedRunRef.current === key) return;
    reportedRunRef.current = key;
    const totals = computeFileTotals(events);
    // Backend'in ürettiği gerçek ajan raporu (operatör/ekip "şunları yaptım/yaptık") + dosya özeti.
    const agentReport = (activeRun.summary ?? "").trim();
    const fileLine = language === "tr"
      ? `\n\n📄 ${totals.count} dosya düzenlendi (+${totals.adds} -${totals.dels}). "İncele" ile değişiklikleri görebilir veya Önizleme açabilirsin.`
      : `\n\n📄 ${totals.count} files changed (+${totals.adds} -${totals.dels}). Review the changes or open Preview.`;
    const content =
      activeRun.status === "completed"
        ? (agentReport || (language === "tr" ? "✅ Görev tamamlandı." : "✅ Task completed.")) + fileLine
        : (language === "tr"
            ? `⚠️ Görev durdu/başarısız: ${activeRun.summary ?? ""}. Bir not bırakıp tekrar başlatabilir veya yeni talimat verebilirsin.`
            : `⚠️ Task stopped/failed: ${activeRun.summary ?? ""}. Leave a note and restart, or give a new instruction.`);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", planner: "system", modelLabel: "Orkestra", content, createdAt: new Date().toISOString() }
    ]);
  }, [activeRun?.status, activeRun?.id]);

  async function addImage(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      const res = await api.post<{ path: string; name: string; isImage: boolean }>("/api/upload", { name: file.name, dataUrl });
      setAttachments((current) => [...current, { path: res.path, name: res.name, preview: dataUrl, isImage: res.isImage }]);
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
    if (ev.type === "heartbeat") return; // sadece bağlantıyı canlı tutar
    if (ev.type === "analysis_pending") {
      setOperatorAnalyzing(ev.modelLabel ?? text.operatorAnalysis);
      return;
    }
    if (ev.type === "message" || ev.type === "summary" || ev.type === "analysis") {
      const isSummary = ev.type === "summary";
      const isAnalysis = ev.type === "analysis";
      if (isAnalysis) setOperatorAnalyzing(null);
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        planner: isAnalysis ? "analysis" : isSummary ? "system" : ev.planner,
        modelLabel: isAnalysis
          ? `${text.operatorAnalysis} · ${ev.modelLabel ?? ""}`
          : isSummary
            ? text.decisionSummary
            : ev.modelLabel,
        content: ev.content ?? "",
        createdAt: new Date().toISOString()
      };
      setMessages((current) => [...current, msg]);
      if (isAnalysis) setLastAnalysis(ev.content ?? "");
      setStreamItems((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          source: msg.modelLabel ?? "?",
          type: isSummary || isAnalysis ? "summary" : "assistant",
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
    const isCode = activeView === "code";
    const res = await fetch("/api/debate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        participants: participants.map((p) => ({ cli: p.cli, model: p.model === "default" ? undefined : p.model })),
        rounds: debateRounds,
        effort: selectedEffort,
        detailLevel: selectedDetailLevel,
        // Code modunda kapanış (özet) stream'de YAPILMAZ; analiz ayrı /api/analyze ile alınır.
        skipClosing: isCode
      })
    });
    if (!res.ok || !res.body) throw new Error(await res.text().catch(() => text.debateCouldNotStart));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Analiz için turları topla (operatör analizi tartışma bitince ayrı çağrılır).
    const collectedTurns: { cli?: string; modelLabel?: string; content?: string }[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "message") collectedTurns.push({ cli: ev.planner, modelLabel: ev.modelLabel, content: ev.content });
          appendDebateEvent(ev);
        } catch {
          // Ignore partial or invalid lines.
        }
      }
    }
    // Code modunda: tartışma bitti → bayrağı kaldır. Operatör analizi codeDebateDone'u izleyen
    // useEffect tarafından TAZE messages'tan tetiklenir (streamDebate closure'ına bağımlı değil).
    void collectedTurns; // (artık kullanılmıyor; analiz useEffect'ten)
    if (isCode) setCodeDebateDone(true);
  }

  // Tartışmadaki turlardan client-side basit bir analiz kartı kurar (backend boş/hata dönerse).
  function clientFallbackAnalysis(message: string, turns: { cli?: string; modelLabel?: string; content?: string }[]) {
    const lines = turns
      .filter((t) => t.content?.trim())
      .map((t) => `- **${t.modelLabel ?? t.cli ?? "Ajan"}**: ${t.content!.trim().replace(/\s+/g, " ").slice(0, 280)}`);
    return [
      "## Ortak Görüş",
      "Operatör otomatik analizi alınamadı; katılımcı görüşleri aşağıda derlenmiştir.",
      "## Benzersiz Fikirler",
      ...lines,
      "## Önerilen Yaklaşım",
      `- "${message}" işini yukarıdaki görüşlerin ortak yönlerini birleştirerek uygulayın.`
    ].join("\n");
  }

  // Tartışma sonrası operatör analizi. KESİN görünürlük: önce ANINDA turlardan bir kart eklenir,
  // sonra gerçek analiz gelince aynı kart GÜNCELLENİR. Backend ne yaparsa yapsın kart görünür.
  async function fetchOperatorAnalysis(message: string, turns: { cli?: string; modelLabel?: string; content?: string }[]) {
    const op = operatorSel ?? participants[0];
    if (!op) return;
    // Bu analiz hangi oturuma ait? Async bittiğinde kullanıcı başka projeye geçmişse YAZMA (sızma önlenir).
    const ownerConvo = codeConvoIdRef.current;
    const stillHere = () => codeConvoIdRef.current === ownerConvo;
    const opLabel = labelForAgent(op.cli, op.model);
    if (!stillHere()) return;
    // Önce SADECE gösterge (kart yok) — "alınamadı" fallback'i flash etmesin, tek kart gelsin.
    setOperatorAnalyzing(opLabel);
    let content = "";
    let modelLbl = opLabel;
    try {
      const res = await Promise.race([
        api.post<{ content: string; modelLabel: string }>("/api/analyze", {
          message,
          turns,
          participants: participants.map((p) => ({ cli: p.cli, model: p.model === "default" ? undefined : p.model })),
          operator: { cli: op.cli, model: op.model === "default" ? undefined : op.model },
          effort: selectedEffort
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("analyze-timeout")), 85_000))
      ]);
      if (res.content?.trim()) {
        content = res.content.trim();
        modelLbl = res.modelLabel ?? opLabel;
      }
    } catch {
      // backend hata/zaman aşımı → client fallback
    }
    if (!content) content = clientFallbackAnalysis(message, turns);
    if (!stillHere()) { setOperatorAnalyzing(null); return; }
    // Tek kart: eski analiz kartı(ları) kaldır, gerçeğini en alta ekle.
    setCodeMessages((current) => [
      ...current.filter((m) => m.planner !== "analysis"),
      {
        id: crypto.randomUUID(),
        role: "assistant",
        planner: "analysis",
        modelLabel: `${text.operatorAnalysis} · ${modelLbl}`,
        content,
        createdAt: new Date().toISOString()
      }
    ]);
    setLastAnalysis(content);
    setOperatorAnalyzing(null);
  }

  async function sendChat(overrideText?: string) {
    const content = (overrideText ?? chatInput).trim();
    const pending = attachments;
    if ((!content && !pending.length) || isThinking) return;
    setNotice(null);
    setSuggestedPrompt(null);
    setCodeDebateDone(false);
    setOperatorAnalyzing(null);
    analysisFiredRef.current = false;
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
      // Kodlama modu: mesaj TARTIŞMA değil, ajana TALİMAT → kaldığı yerden devam et.
      if (isCodeView && codingActive) {
        await continueCodingRun(messageToSend);
        return;
      }
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

  // Çalışılan workspace için bir proje bulur ya da otomatik oluşturur; aktif yapar ve
  // mevcut kod oturumunu o projeye etiketler. Proje açmadan başlatınca proje kendiliğinden oluşur.
  function ensureProject(workspacePath: string, name: string) {
    let proj = projects.find((p) => p.workspacePath === workspacePath);
    if (!proj) {
      proj = { id: crypto.randomUUID(), name: (name || "Proje").trim().slice(0, 60), workspacePath, createdAt: new Date().toISOString() };
      setProjects((cur) => {
        const next = [proj!, ...cur];
        persistProjects(next);
        return next;
      });
    }
    setActiveProjectId(proj.id);
    // Aktif kod oturumunu bu projeye bağla.
    setCodeConvos((cur) => {
      const next = cur.map((c) => (c.id === codeConvoId ? { ...c, projectId: proj!.id, workspacePath } : c));
      saveConversations(CODE_CONVERSATIONS_KEY, next);
      return next;
    });
    return proj;
  }

  async function startRun(prompt: string) {
    // Aktif bir proje varsa aynı workspace'te devam et (sürekli geliştirme).
    const run = await api.post<Run>("/api/runs", {
      prompt,
      workspacePath: projectWorkspace ?? undefined
    });
    setActiveRun(run);
    setProjectWorkspace(run.workspacePath);
    ensureProject(run.workspacePath, deriveTitle(messages));
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
      // Fazları İLGİLİ AJAN (operatör ya da ilk katılımcı) ANALİZ KARTINI dikkate alarak belirlesin.
      const lead = operatorSel ?? participants[0];
      const res = await api.post<{ tasks: PlanTask[]; planner: string; modelLabel: string }>("/api/plan", {
        history: messages,
        planner: lead?.cli ?? "auto",
        model: lead && lead.model !== "default" ? lead.model : undefined,
        analysis: lastAnalysis ?? undefined
      });
      // Her göreve, oturum açılmış (limitli olmayan) bir CLI+model'i varsayılan ata —
      // kullanıcı modalda değiştirebilir. Tartışmadaki katılımcıları öncelikli dağıt.
      const pool = participants.length
        ? participants.filter((p) => {
            const mo = participantSources.find((s) => s.cli === p.cli)?.models.find((m) => m.id === p.model);
            return !mo?.limited;
          })
        : firstAvailableAgents();
      const seeded = (res.tasks ?? []).map((t, i) => {
        const pick = pool.length ? pool[i % pool.length] : undefined;
        return { ...t, cli: pick?.cli, model: pick?.model };
      });
      setPlanTasks(seeded);
      setPlanMeta(res.modelLabel);
    } catch (error) {
      setPlanTasks([]);
      setNotice(`${language === "tr" ? "Plan üretilemedi" : "Plan failed"}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPlanLoading(false);
    }
  }

  // Onaylanan ekip planını çalıştır (ekip modu run'ı).
  // Görevleri "kodlayıcılar paralel, denetçi/düzeltici sonra" şeklinde bağla.
  // Kodlayıcılar kendi (plandan gelen) bağımlılıklarını korur; denetçi tüm kodlayıcıları,
  // düzeltici denetçileri (yoksa kodlayıcıları) bekler. Böylece kod yazımı paralel akar.
  function wireTeamDependencies(tasks: PlanTask[]): PlanTask[] {
    const builderIds = tasks.filter((t) => (t.role ?? "builder") === "builder").map((t) => t.id);
    const reviewerIds = tasks.filter((t) => t.role === "reviewer").map((t) => t.id);
    return tasks.map((t) => {
      if (t.role === "reviewer") return { ...t, dependsOn: builderIds.filter((id) => id !== t.id) };
      if (t.role === "fixer") return { ...t, dependsOn: (reviewerIds.length ? reviewerIds : builderIds).filter((id) => id !== t.id) };
      return t; // kodlayıcı: plandaki bağımlılığını koru (genelde boş → paralel)
    });
  }

  async function approvePlan() {
    if (!planTasks.length) return;
    setPlanOpen(false);
    const goal = goalFromConversation() || planTasks.map((t) => t.title).join("; ");
    const run = await api.post<Run>("/api/runs", {
      prompt: goal,
      tasks: wireTeamDependencies(planTasks),
      workspacePath: projectWorkspace ?? undefined
    });
    setActiveRun(run);
    setProjectWorkspace(run.workspacePath);
    ensureProject(run.workspacePath, deriveTitle(messages));
    setEvents([]);
    setSuggestedPrompt(null);
    setCodeDebateDone(false);
    setCodingActive(true); // ekip kodlamaya başladı → kodlama modu
    await refresh();
  }

  // Oturum açılmış, limitli olmayan tüm CLI+model adayları.
  function firstAvailableAgents() {
    return participantSources.flatMap((s) =>
      s.models.filter((m) => !m.limited).map((m) => ({ cli: s.cli, model: m.id }))
    );
  }

  // CLI+model için okunur etiket (Ekip Çalışması görev başlıklarında).
  function labelForAgent(cli: DebateParticipant, model: string) {
    const src = participantSources.find((s) => s.cli === cli);
    const m = src?.models.find((mm) => mm.id === model);
    return `${src?.label ?? cli}${m && m.id !== "default" ? ` · ${m.label}` : ""}`;
  }

  // Sohbet/analiz geçmişinden proje hedefini metin olarak çıkarır.
  function goalFromConversation() {
    const convo = messages.filter((m) => m.id !== "welcome" && m.content.trim());
    const base = convo
      .map((m) => `${m.role === "user" ? "Kullanıcı" : m.modelLabel || "Asistan"}: ${m.content}`)
      .join("\n\n");
    const analysis = lastAnalysis ? `\n\n--- OPERATÖR ANALİZİ ---\n${lastAnalysis}` : "";
    return `${base}${analysis}`.trim();
  }

  // Operatör projeyi kendi CLI+model'iyle yapar. Fazları, ANALİZ KARTINI dikkate alarak
  // operatörün kendisi belirler; her faz = operatöre tek görev, faz faz checkpoint'li gider.
  async function operatorBuild() {
    if (!operatorSel) {
      setNotice(language === "tr" ? "Önce bir operatör seçin." : "Pick an operator first.");
      return;
    }
    const op = operatorSel;
    const goal = goalFromConversation();
    setOperatorAnalyzing(labelForAgent(op.cli, op.model)); // "planlıyor" göstergesi
    let tasks: PlanTask[] = [];
    try {
      // Operatör analizi temel alarak projeyi fazlara böler.
      const plan = await api.post<{ tasks: PlanTask[] }>("/api/plan", {
        history: messages,
        planner: op.cli,
        model: op.model !== "default" ? op.model : undefined,
        analysis: lastAnalysis ?? undefined
      });
      const phases = [...new Set((plan.tasks ?? []).map((t) => t.phase ?? 1))].sort((a, b) => a - b);
      // Her faz → operatöre TEK görev (aynı ajanın paralel çakışmasını önler, faz faz ilerler).
      tasks = phases.map((ph) => ({
        id: `op-phase-${ph}`,
        title: (plan.tasks ?? []).filter((t) => (t.phase ?? 1) === ph).map((t) => t.title).join("; ") || `Faz ${ph}`,
        cli: op.cli,
        model: op.model,
        role: "builder" as AgentRole,
        phase: ph
      }));
    } catch {
      tasks = [];
    } finally {
      setOperatorAnalyzing(null);
    }
    if (!tasks.length) {
      tasks = [{ id: "operator-build", title: goal.slice(0, 80) || "Projeyi uygula", cli: op.cli, model: op.model, role: "builder" }];
    }
    const run = await api.post<Run>("/api/runs", {
      prompt: goal || tasks[0].title,
      tasks,
      workspacePath: projectWorkspace ?? undefined
    });
    setActiveRun(run);
    setProjectWorkspace(run.workspacePath);
    ensureProject(run.workspacePath, deriveTitle(messages));
    setEvents([]);
    setSuggestedPrompt(null);
    setCodeDebateDone(false);
    setCodingActive(true); // artık kodlama modu — yeni mesajlar talimat olur, tartışma değil
    setNotice(text.operatorBuildStarted);
    await refresh();
  }

  // Kodlama modunda yeni talimat: SIFIRDAN değil, mevcut workspace'te kaldığı yerden devam.
  // Operatör (yoksa katılımcı/varsayılan builder) tek görev olarak uygular — tartışma yapmaz.
  async function continueCodingRun(instruction: string) {
    const op = operatorSel ?? participants[0];
    const prompt = [
      `KULLANICI TALİMATI: ${instruction}`,
      "",
      "Bu projede DAHA ÖNCE çalıştın; tüm dosyalar bu çalışma klasöründe (workspace) mevcut.",
      "Önce mevcut dosyaları incele. SIFIRDAN BAŞLAMA. Kaldığın yerden devam et ve YALNIZCA bu talimatı uygula.",
      "Tartışma/analiz yapma; doğrudan kodu yaz/düzenle. Çıktını kısa tut."
    ].join("\n");
    const tasks: PlanTask[] = [
      { id: `continue-${Date.now()}`, title: instruction.slice(0, 80) || "Devam", cli: op?.cli, model: op?.model, role: "builder" }
    ];
    const run = await api.post<Run>("/api/runs", {
      prompt,
      tasks,
      workspacePath: projectWorkspace ?? undefined
    });
    setActiveRun(run);
    setProjectWorkspace(run.workspacePath);
    setEvents([]);
    await refresh();
  }

  // Çalışan run'a ara talimat (steering notu) bırak.
  async function addRunNote(note: string) {
    if (!activeRun || !note.trim()) return;
    // Notu chat'te kullanıcı mesajı olarak göster.
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: `📌 ${note.trim()}`, createdAt: new Date().toISOString() }
    ]);
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

  // Oturuma dönünce: kayıtlı bekleyen faz run'ını geri yükle (faz onayı butonu + activeRun gelsin).
  async function restorePendingPhase(runId?: string | null) {
    if (!runId) { setPhasePending(null); return; }
    try {
      const run = await api.get<Run>(`/api/runs/${runId}`);
      const awaiting =
        (run.status === "running" && /awaiting/i.test(run.activeStep ?? "")) ||
        (run.status === "failed" && /Duraklat|⏸/i.test(run.summary ?? ""));
      if (awaiting) {
        setActiveRun(run);
        setPhasePending(runId);
      } else {
        setPhasePending(null);
      }
    } catch {
      setPhasePending(null);
    }
  }

  // Faz onayı: "devam et" → bir sonraki faza geç.
  async function resumePhase() {
    if (!phasePending) return;
    const id = phasePending;
    setPhasePending(null);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: "✅ Onaylandı — sıradaki faza devam et.", createdAt: new Date().toISOString() }
    ]);
    try {
      await api.post(`/api/runs/${id}/resume`);
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

  const sidebarHeader = (
    <div className="sidebarHeader">
      <div className="brand">
        <span className="brandMain">
          <img src="/logo.png" alt="Orkestra Logo" className="logo" />
          <strong>Orkestra</strong>
        </span>
        <button className="iconButton sidebarCollapseBtn" onClick={() => setSidebarCollapsed(true)} title={text.collapseSidebar}>
          <PanelLeft size={18} />
        </button>
      </div>
      <div className="sidebarHeaderActions">
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
        <div className={`connectionPill ${online ? "online" : "offline"}`} title={online ? text.connected : text.disconnected}>
          <span />
        </div>
      </div>
    </div>
  );

  // Kapalı sidebar: dar ikon rayı — logo (üst) + erişim ikonları. Her iki modda da görünür.
  const sidebarRail = (
    // Ray'ın herhangi bir boş yerine tıklayınca da açılır.
    <div className="sidebarRail" onClick={() => setSidebarCollapsed(false)}>
      {/* Üstte logo; bara gelince aç/kapa tuşuna dönüşür. */}
      <button className="railLogoBtn" onClick={() => setSidebarCollapsed(false)} title={text.expandSidebar}>
        <img src="/logo.png" alt="Orkestra" className="railLogo" />
        <PanelLeft size={20} className="railLogoToggle" />
      </button>
      <button className="railBtn" onClick={() => { setSidebarCollapsed(false); newChat(); }} title={text.newChat}>
        <Plus size={18} />
      </button>
      <button className="railBtn" onClick={() => setSidebarCollapsed(false)} title={text.searchPlaceholder}>
        <Search size={18} />
      </button>
      <div className="railSpacer" />
      <button
        className="railBtn"
        onClick={(e) => { e.stopPropagation(); setTheme((t) => (t === "light" ? "dark" : "light")); }}
        title={theme === "light" ? text.switchDark : text.switchLight}
      >
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>
    </div>
  );

  return (
    <main className="appShell">
      <section className={`workspace${sidebarCollapsed ? " sidebarCollapsed" : ""}`}>
        {activeView === "chat" ? (
          <>
            <aside className={`leftColumn${sidebarCollapsed ? " collapsed" : ""}`}>
              {sidebarCollapsed ? sidebarRail : (
              <>
              {sidebarHeader}
              <ChatHistoryPanel
                language={language}
                sessions={chatConvos}
                activeSessionId={chatConvoId}
                onNew={newChat}
                onOpen={openConversation}
                onDelete={deleteConversation}
              />
              <AgentCenter
                language={language}
                status={cliStatus}
                gitStatus={gitStatus}
                onRefresh={() => void refresh()}
                onAction={(tool, action) => void runCliAction(tool, action)}
              />
              </>
              )}
            </aside>

            <section className="centerColumn">
              <div className="centerColHeader">
                <div className="viewSwitcher">
                  <button
                    className="active"
                    onClick={() => setActiveView("chat")}
                  >
                    <MessageSquare size={16} />
                    <span>{text.tabChat}</span>
                  </button>
                  <button
                    className=""
                    onClick={() => setActiveView("code")}
                  >
                    <Code size={16} />
                    <span>{text.tabCode}</span>
                  </button>
                </div>
              </div>
              <div className="chatWrap">
                <ChatPanel
                  language={language}
                  status={cliStatus}
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
            </section>
          </>
        ) : (
          <div
            className={`codeLayout${terminalOpen ? " termOpen" : ""}${sidebarCollapsed ? " sidebarCollapsed" : ""}${terminalResizing ? " resizing" : ""}`}
            style={{ ["--term-w" as string]: `${terminalWidth}px` }}
          >
            <aside className={`codeLeftCol${sidebarCollapsed ? " collapsed" : ""}`}>
              {sidebarCollapsed ? sidebarRail : (
              <>
              {sidebarHeader}
              <FileExplorer
                language={language}
                rootPath={activeRun?.workspacePath ?? projectWorkspace ?? null}
                refreshKey={workspaceFileEventCount}
                onOpenFile={(path) => void openFileInDialog(path)}
              />
              <ProjectPanel
                language={language}
                projects={projects}
                sessions={codeConvos}
                activeProjectId={activeProjectId}
                activeSessionId={codeConvoId}
                onSwitch={switchProject}
                onCreate={() => void createProject()}
                onRename={(id) => void renameProject(id)}
                onDelete={deleteProject}
                onNewSession={newSessionInProject}
                onOpenSession={openConversation}
                onDeleteSession={deleteConversation}
              />
              <AgentCenter
                language={language}
                status={cliStatus}
                gitStatus={gitStatus}
                onRefresh={() => void refresh()}
                onAction={(tool, action) => void runCliAction(tool, action)}
                compact
              />
              </>
              )}
            </aside>

            <div className="codeCenterCol">
              <div className="centerColHeader">
                <div className="viewSwitcher">
                  <button
                    className=""
                    onClick={() => setActiveView("chat")}
                  >
                    <MessageSquare size={16} />
                    <span>{text.tabChat}</span>
                  </button>
                  <button
                    className="active"
                    onClick={() => setActiveView("code")}
                  >
                    <Code size={16} />
                    <span>{text.tabCode}</span>
                  </button>
                </div>
              </div>
              <div className="codeChatSection codeChatFull">
                <CodeChatPanel
                  language={language}
                  status={cliStatus}
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
                  onContinueChat={() => { setNotice(null); setCodeDebateDone(false); }}
                  onOperatorBuild={() => void operatorBuild()}
                  debateDone={codeDebateDone}
                  operatorAnalyzing={operatorAnalyzing}
                  phasePending={!!phasePending && phasePending === activeRun?.id}
                  onResumePhase={() => void resumePhase()}
                  codingActive={codingActive}
                  onExitCoding={() => setCodingActive(false)}
                  participantSources={participantSources}
                  participants={participants}
                  onParticipantsChange={setParticipants}
                  debateRounds={debateRounds}
                  onRoundsChange={setDebateRounds}
                  operatorSel={operatorSel}
                  onOperatorChange={setOperatorSel}
                  analysisReady={!!lastAnalysis}
                  onStart={startFromChat}
                  runActive={activeRun?.status === "running" || activeRun?.status === "queued"}
                  onAddNote={(note) => void addRunNote(note)}
                  onStopRun={() => void stopRun()}
                  attachments={attachments}
                  onAddImage={(file) => void addImage(file)}
                  onRemoveImage={removeImage}
                  conversations={activeProjectId ? codeConvos.filter((c) => c.projectId === activeProjectId) : codeConvos.filter((c) => !c.projectId)}
                  activeConversationId={conversationId}
                  onOpenConversation={openConversation}
                  onDeleteConversation={deleteConversation}
                  onNewChat={newChat}
                  projects={projects}
                  activeProjectId={activeProjectId}
                  onSwitchProject={switchProject}
                  onNewProject={newProject}
                  onDeleteProject={deleteProject}
                  run={activeRun}
                  events={events}
                  onOpenFile={(path) => void openFileInDialog(path)}
                  onTogglePreview={() => setShowPreview((current) => !current)}
                  previewOpen={showPreview}
                  previewAvailable={previewAvailable}
                />
              </div>
            </div>

            <IntegratedTerminal
              language={language}
              open={terminalOpen}
              width={terminalWidth}
              onWidthChange={setTerminalWidth}
              onResizeStart={() => setTerminalResizing(true)}
              onResizeEnd={() => setTerminalResizing(false)}
              sessions={terminalSessions}
              activeId={activeTerminalId}
              outputs={terminalOutputs}
              onToggle={() => setTerminalOpen((value) => !value)}
              onCreate={(shell) => void createTerminal(shell)}
              onClose={(id) => void closeTerminal(id)}
              onSelect={setActiveTerminalId}
              onInput={(id, value) => void sendTerminalInput(id, value)}
            />
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
              <strong>{text.teamWork}</strong>
              <span className="briefMeta">{planLoading ? text.generating : planMeta ? `${planMeta} ${text.generatedEditable}` : ""}</span>
              <button className="iconButton" onClick={() => setPlanOpen(false)} title={text.close}>
                <X size={16} />
              </button>
            </div>
            <p className="teamWorkDesc">{text.teamWorkDesc}</p>
            <div className="planList">
              {planLoading && <p className="muted">{text.generating}</p>}
              {!planLoading && planTasks.map((task, index) => (
                <div className="taskCard" key={index}>
                  <div className="taskCardTop">
                    <span className="taskCardNum">{index + 1}</span>
                    <input
                      className="taskCardTitle"
                      value={task.title}
                      placeholder={text.taskInstruction}
                      onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, title: e.target.value } : t)))}
                    />
                    <button className="iconButton" onClick={() => setPlanTasks((cur) => cur.filter((_, i) => i !== index))} title={text.remove}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="taskCardGrid">
                    <label className="taskField">
                      <span>{text.assignAgent}</span>
                      <select
                        className="pill"
                        value={task.cli ? `${task.cli}|${task.model ?? "default"}` : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPlanTasks((cur) => cur.map((t, i) => {
                            if (i !== index) return t;
                            if (!v) return { ...t, cli: undefined, model: undefined };
                            const [cli, model] = v.split("|");
                            return { ...t, agentId: undefined, cli, model };
                          }));
                        }}
                      >
                        <option value="">{text.assignByRole}</option>
                        {participantSources.flatMap((s) =>
                          s.models.map((m) => (
                            <option key={`${s.cli}|${m.id}`} value={`${s.cli}|${m.id}`} disabled={m.limited}>
                              {s.label}{m.id !== "default" ? ` · ${m.label}` : ""}{m.limited ? ` (${text.limited})` : ""}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="taskField">
                      <span>{text.role}</span>
                      <select
                        className="pill"
                        value={task.role ?? "builder"}
                        onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, role: e.target.value as AgentRole } : t)))}
                      >
                        <option value="builder">{text.roleBuilder}</option>
                        <option value="reviewer">{text.roleReviewer}</option>
                        <option value="fixer">{text.roleFixer}</option>
                      </select>
                    </label>
                    <label className="taskField">
                      <span>{text.folder}</span>
                      <input
                        className="pill"
                        value={task.folder ?? ""}
                        placeholder="—"
                        onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, folder: e.target.value } : t)))}
                      />
                    </label>
                    <label className="taskField">
                      <span>{text.dependsOn}</span>
                      <input
                        className="pill"
                        value={(task.dependsOn ?? []).join(", ")}
                        placeholder="—"
                        onChange={(e) => setPlanTasks((cur) => cur.map((t, i) => (i === index ? { ...t, dependsOn: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : t)))}
                      />
                    </label>
                  </div>
                </div>
              ))}
              {!planLoading && (
                <button
                  className="ghostButton addTaskBtn"
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
      {textPrompt && (
        <TextPromptModal
          state={textPrompt}
          cancelLabel={text.cancel}
          onClose={() => setTextPrompt(null)}
        />
      )}
    </main>
  );
}

// Composer textarea'sını içeriğe göre büyütür (en çok ~8 satır), value boşalınca geri küçülür.
function useAutoGrow(value: string, maxPx = 184) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [value, maxPx]);
  return ref;
}

// Mesaj kopyalama butonu (kullanıcı + ajan baloncukları). Kopyalayınca kısa süre tik gösterir.
function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // pano erişimi yoksa sessizce geç
    }
  };
  return (
    <button className={`copyBtn${copied ? " copied" : ""}`} onClick={copy} title={copied ? copiedLabel : label}>
      {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
    </button>
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
  // Kapalı bir kart: tıklayınca limitler açılır, dışarı tıklayınca otomatik kapanır.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <section ref={rootRef} className={`glassPanel agentCenterPanel${compact ? " agentCenterCompact" : ""}${open ? " open" : ""}`}>
      <div className="panelTitle split agentCenterToggle" onClick={() => setOpen((o) => !o)} role="button" title={text.agentCenter}>
        <span>
          <Zap size={17} />
          {text.agentCenter}
        </span>
        <span className="agentCenterToggleRight">
          {open && (
            <button className="iconButton" onClick={(e) => { e.stopPropagation(); onRefresh(); }} title={text.refresh}>
              <RefreshCw size={15} />
            </button>
          )}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </div>

      {open && (
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
      )}
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
  status,
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
  status: CliStatusResponse | null;
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
  attachments: { path: string; name: string; preview: string; isImage: boolean }[];
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
  const composerRef = useAutoGrow(value);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, suggestedPrompt]);

  return (
    <section className="chatPanel glassPanel">

      <div className="chatMessages">
        {messages.map((message) => (
          <article key={message.id ?? `${message.role}-${message.createdAt}`} className={`chatBubble ${message.role} compact`}>
            {message.role === "assistant" && (
              <div className="messageMeta">
                <Bot size={14} />
                <span>{message.modelLabel ?? "Orkestra"}</span>
              </div>
            )}
            <pre>{message.content}</pre>
            <div className="bubbleFooter">
              {message.createdAt && <time>{new Date(message.createdAt).toLocaleTimeString("tr-TR")}</time>}
              <CopyButton value={message.content} label={text.copyMessage} copiedLabel={text.copied} />
            </div>
          </article>
        ))}
        {thinking && (
          <article className="chatBubble assistant thinking compact">
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
        <div className="modeSwitch compact">
          {(["single", "multi", "debate"] as ChatMode[]).map((item) => {
            const disabled = item !== "single" && !multiAvailable;
            return (
              <button
                key={item}
                className={`modeTab${mode === item ? " on" : ""}${item === "debate" ? " debate" : ""}`}
                disabled={disabled}
                onClick={() => onModeChange(item)}
              >
                {item === "single" && <Bot size={14} />}
                {item === "multi" && <Users size={14} />}
                {item === "debate" && <Swords size={14} />}
                {modeMeta[item].label}
                <span className="modeTip">{disabled ? text.needsTwoCli : modeMeta[item].desc}</span>
              </button>
            );
          })}
        </div>
        {(mode === "debate" || mode === "multi") && (
          <div className="debateControls">
            <ModelPicker
              language={language}
              sources={participantSources}
              mode="multi"
              participants={participants}
              onParticipantsChange={onParticipantsChange}
            />
          </div>
        )}

      <div className={`composerBox${listening ? " recording" : ""}`}>
        {attachments.length > 0 && (
          <div className="attachmentRow">
            {attachments.map((item) => (
              <div className="attachmentChip" key={item.path}>
                {item.isImage ? <img src={item.preview} alt={item.name} /> : <FileText size={14} className="attachmentFileIcon" />}
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
              ref={composerRef}
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
                  <ModelPicker
                    language={language}
                    sources={participantSources}
                    mode="single"
                    selected={{ cli: singleCli, model: selectedModel }}
                    onSelect={(s) => { if (s) { onSingleCliChange(s.cli); onModelChange(s.model); } }}
                  />
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
                {mode === "single" && (
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
                )}
              </div>
              <div className="composerBarRight">
                <LimitGauge status={status} language={language} />
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
// OpenRouter-fusion tarzı model seçici: aranabilir CLI×model dialog'u.
// mode "multi" → katılımcı ekle (çoklu, chip'li); mode "single" → operatör (Birleştir, tekli).
function ModelPicker({
  language,
  sources,
  mode,
  participants = [],
  onParticipantsChange,
  selected = null,
  onSelect,
  allowNone = false,
  triggerPrefix,
  noneLabel
}: {
  language: Language;
  sources: { cli: DebateParticipant; label: string; models: ModelOption[] }[];
  mode: "multi" | "single";
  participants?: { cli: DebateParticipant; model: string }[];
  onParticipantsChange?: (next: { cli: DebateParticipant; model: string }[]) => void;
  selected?: { cli: DebateParticipant; model: string } | null;
  onSelect?: (next: { cli: DebateParticipant; model: string } | null) => void;
  allowNone?: boolean;
  triggerPrefix?: string;
  noneLabel?: string;
}) {
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const q = query.trim().toLowerCase();
  // "default" yazısı yerine: adı varsa modelin adı, yoksa "Otomatik".
  const labelForModel = (m: ModelOption) => (m.id === "default" ? text.auto : m.label);
  const modelLabelOf = (cli: DebateParticipant, model: string) => {
    const m = sources.find((s) => s.cli === cli)?.models.find((mm) => mm.id === model);
    return m ? labelForModel(m) : model;
  };
  // İsimli modeller varsa "default"u gizle; yoksa tek "default"u "Otomatik" olarak göster.
  const shownModels = (s: { models: ModelOption[] }) => {
    const named = s.models.filter((m) => m.id !== "default");
    return named.length ? named : s.models;
  };
  const isSelected = (cli: DebateParticipant, model: string) =>
    mode === "multi"
      ? participants.some((p) => p.cli === cli && p.model === model)
      : !!selected && selected.cli === cli && selected.model === model;

  const choose = (cli: DebateParticipant, model: string) => {
    if (mode === "multi") {
      const exists = participants.some((p) => p.cli === cli && p.model === model);
      onParticipantsChange?.(
        exists ? participants.filter((p) => !(p.cli === cli && p.model === model)) : [...participants, { cli, model }]
      );
    } else {
      onSelect?.({ cli, model });
      setOpen(false);
    }
  };

  const singleValueLabel = selected
    ? `${plannerLabels[selected.cli]}${selected.model && selected.model !== "default" ? ` · ${modelLabelOf(selected.cli, selected.model)}` : ""}`
    : (noneLabel ?? "");

  return (
    <div className="modelPicker" ref={ref}>
      <div className="modelPickerTrigger">
        {mode === "multi" &&
          participants.map((p, i) => (
            <span className="partChip on" key={`${p.cli}-${p.model}-${i}`}>
              {plannerLabels[p.cli]}{p.model !== "default" ? ` · ${modelLabelOf(p.cli, p.model)}` : ""}
              <button
                className="partChipRemove"
                onClick={() => onParticipantsChange?.(participants.filter((_, idx) => idx !== i))}
                title={text.remove}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        {mode === "multi" ? (
          <button className="addModelBtn" onClick={() => setOpen((o) => !o)}>
            <Plus size={14} /> {text.addModel}
          </button>
        ) : (
          <button className="fuseWithBtn" onClick={() => setOpen((o) => !o)}>
            {triggerPrefix && <span className="fuseLabel">{triggerPrefix}</span>}
            <span className="fuseModel">{singleValueLabel}</span>
          </button>
        )}
      </div>
      {open && (
        <div className="modelPickerDialog" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modelPickerSearch">
            <Search size={14} />
            <input autoFocus value={query} placeholder={text.searchModels} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="modelPickerList">
            {mode === "single" && allowNone && (
              <button className={`modelPickerRow${!selected ? " selected" : ""}`} onClick={() => { onSelect?.(null); setOpen(false); }}>
                <span className="modelPickerRowName">{noneLabel}</span>
                {!selected && <CheckCircle2 size={14} />}
              </button>
            )}
            {sources.map((s) => {
              const rows = shownModels(s).filter((m) => !q || s.label.toLowerCase().includes(q) || labelForModel(m).toLowerCase().includes(q));
              if (!rows.length) return null;
              return (
                <div className="modelPickerGroupWrap" key={s.cli}>
                  <div className="modelPickerGroup">
                    <span className={`agentIcon ${s.cli}`}>{iconForTool(s.cli)}</span>
                    {s.label}
                  </div>
                  {rows.map((m) => {
                    const sel = isSelected(s.cli, m.id);
                    return (
                      <button
                        key={m.id}
                        className={`modelPickerRow${sel ? " selected" : ""}`}
                        disabled={m.limited}
                        onClick={() => choose(s.cli, m.id)}
                      >
                        <span className="modelPickerRowName">{labelForModel(m)}{m.limited ? ` · ${text.limited}` : ""}</span>
                        {sel && <CheckCircle2 size={14} />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {sources.every((s) => !shownModels(s).some((m) => !q || s.label.toLowerCase().includes(q) || labelForModel(m).toLowerCase().includes(q))) && (
              <div className="modelPickerEmpty">{text.noResults}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

// Temalı metin giriş modalı — window.prompt yerine (proje oluştur / yeniden adlandır).
function TextPromptModal({ state, cancelLabel, onClose }: { state: TextPromptState; cancelLabel: string; onClose: () => void }) {
  const [value, setValue] = useState(state.initial);
  // state değişince (yeni bir prompt açılınca) input değerini sıfırla.
  useEffect(() => {
    setValue(state.initial);
  }, [state]);
  const submit = () => {
    state.resolve(value.trim() ? value.trim() : null);
    onClose();
  };
  const cancel = () => {
    state.resolve(null);
    onClose();
  };
  return (
    <div className="promptOverlay" onMouseDown={cancel}>
      <div className="promptDialog glassPanel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="promptTitle">{state.title}</div>
        <input
          className="promptInput"
          autoFocus
          value={value}
          placeholder={state.placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
        <div className="promptActions">
          <button className="ghostButton" onClick={cancel}>
            {cancelLabel}
          </button>
          <button className="primaryButton" onClick={submit} disabled={!value.trim()}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sol sütun: proje yönetimi (Ajan Merkezi'nin üstünde). Oluştur / geç / yeniden adlandır / sil.
function ProjectPanel({
  language,
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onNewSession,
  onOpenSession,
  onDeleteSession
}: {
  language: Language;
  projects: Project[];
  sessions: StoredConversation[];
  activeProjectId: string | null;
  activeSessionId: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onNewSession: (projectId: string) => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
}) {
  const text = uiText[language];
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(activeProjectId ? [activeProjectId] : []));
  // ChatGPT tarzı ⋯ menüsü: hangi projenin menüsü açık.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Dışarı tıklayınca menüyü kapat.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);
  const q = query.trim().toLowerCase();
  const sessionsOf = (pid: string) => sessions.filter((s) => s.projectId === pid);
  // Arama: proje adı VEYA içindeki oturum başlığı eşleşirse göster.
  const visible = projects.filter((p) => {
    if (!q) return true;
    if (p.name.toLowerCase().includes(q)) return true;
    return sessionsOf(p.id).some((s) => (s.title || "").toLowerCase().includes(q));
  });
  const toggle = (id: string) => setExpanded((cur) => {
    const next = new Set(cur);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <section className="glassPanel projectPanel">
      <div className="panelTitle split">
        <span>
          <Folder size={16} />
          {text.projects}
        </span>
        <button className="iconButton" onClick={onCreate} title={text.newProjectTitle}>
          <Plus size={14} />
        </button>
      </div>
      <div className="panelSearch">
        <Search size={13} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text.searchPlaceholder} />
      </div>
      <div className="projectList">
        {visible.length === 0 && <p className="projectEmpty">{q ? text.noResults : text.noProjectsDesc}</p>}
        {visible.map((p) => {
          const open = expanded.has(p.id) || !!q;
          const sess = sessionsOf(p.id).filter((s) => !q || (s.title || "").toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
          return (
            <div className="projectGroup" key={p.id}>
              <div className={`projectRow${p.id === activeProjectId ? " active" : ""}`}>
                <button className="projectChevron" onClick={() => toggle(p.id)} title={open ? text.collapse : text.expand}>
                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <button className="projectNameBtn" onClick={() => { onSwitch(p.id); if (!expanded.has(p.id)) toggle(p.id); }} title={p.workspacePath}>
                  <span className="projectDot" />
                  <span className="projectNameText">{p.name}</span>
                </button>
                <button className="iconButton rowAction" onClick={() => onNewSession(p.id)} title={text.newSessionTitle}><Plus size={13} /></button>
                <div className="rowMenuWrap">
                  <button
                    className="iconButton rowAction"
                    onClick={(e) => { e.stopPropagation(); setMenuFor((cur) => (cur === p.id ? null : p.id)); }}
                    title={text.moreActions}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  {menuFor === p.id && (
                    <div className="rowMenu" onMouseDown={(e) => e.stopPropagation()}>
                      <button onClick={() => { setMenuFor(null); onRename(p.id); }}>
                        <Pencil size={13} /> {text.renameProject}
                      </button>
                      <button className="danger" onClick={() => { setMenuFor(null); if (confirm(text.deleteProjectConfirm)) onDelete(p.id); }}>
                        <Trash2 size={13} /> {text.deleteProject}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {open && (
                <div className="sessionList">
                  {sess.length === 0 && <p className="sessionEmpty">{text.noSessionsYet}</p>}
                  {sess.map((s) => (
                    <div className={`sessionRow${s.id === activeSessionId ? " active" : ""}`} key={s.id}>
                      <button className="sessionNameBtn" onClick={() => onOpenSession(s.id)} title={s.title}>
                        <MessageCircle size={11} />
                        <span className="sessionNameText">{s.title || text.untitled}</span>
                      </button>
                      <button className="sessionDelete" onClick={() => onDeleteSession(s.id)} title={text.delete}><X size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Chat modu sol panel: düz "Geçmiş Sohbetler" listesi (ilk 10 + daha fazla göster) + arama.
function ChatHistoryPanel({
  language,
  sessions,
  activeSessionId,
  onNew,
  onOpen,
  onDelete
}: {
  language: Language;
  sessions: StoredConversation[];
  activeSessionId: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const text = uiText[language];
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = q ? sessions.filter((s) => (s.title || "").toLowerCase().includes(q)) : sessions;
  const shown = showAll || q ? filtered : filtered.slice(0, 10);
  return (
    <section className="glassPanel projectPanel">
      <div className="panelTitle split">
        <span>
          <History size={16} />
          {text.chatHistoryTitle}
        </span>
        <button className="iconButton" onClick={onNew} title={text.newChat}>
          <Plus size={14} />
        </button>
      </div>
      <div className="panelSearch">
        <Search size={13} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text.searchPlaceholder} />
      </div>
      <div className="sessionList flat">
        {shown.length === 0 && <p className="sessionEmpty">{q ? text.noResults : text.noSessionsYet}</p>}
        {shown.map((s) => (
          <div className={`sessionRow${s.id === activeSessionId ? " active" : ""}`} key={s.id}>
            <button className="sessionNameBtn" onClick={() => onOpen(s.id)} title={s.title}>
              <MessageCircle size={11} />
              <span className="sessionNameText">{s.title || text.untitled}</span>
            </button>
            <button className="sessionDelete" onClick={() => onDelete(s.id)} title={text.delete}><X size={11} /></button>
          </div>
        ))}
        {!q && !showAll && filtered.length > 10 && (
          <button className="showMoreBtn" onClick={() => setShowAll(true)}>{text.showMore} ({filtered.length - 10})</button>
        )}
      </div>
    </section>
  );
}

// Sağ sütun altındaki canlı görev durum çubuğu: aktif mi, hangi adımda, kaç dosya.
function RunStatusBar({ run, events, language }: { run: Run | null; events: RunEvent[]; language: Language }) {
  const text = uiText[language];
  const status = run?.status ?? "idle";
  const active = status === "running" || status === "queued";
  const fileEvents = events.filter((e) => e.type === "file_created" || e.type === "file_changed" || e.type === "file_deleted");
  const touched = new Set(fileEvents.map((e) => e.message)).size;
  const lastStep = [...events].reverse().find((e) => e.type === "agent_step")?.message ?? run?.activeStep ?? null;
  const statusLabel: Record<string, string> = {
    idle: text.statusIdle,
    queued: text.statusQueued,
    running: text.statusRunning,
    completed: text.statusCompleted,
    failed: text.statusFailed
  };
  return (
    <div className={`runStatusBar ${status}`}>
      <div className="runStatusTop">
        <span className={`runStatusDot${active ? " pulse" : ""}`} />
        <strong>{statusLabel[status] ?? status}</strong>
        {touched > 0 && <span className="runStatusFiles">{touched} {text.changedFiles}</span>}
      </div>
      {active && lastStep && <div className="runStatusStep" title={lastStep}>{lastStep}</div>}
    </div>
  );
}

// Operatör analizini (## başlıklı Markdown) renkli/ikonlu kartlara ayırır.
const ANALYSIS_THEMES: { match: RegExp; key: string; icon: any; tone: string }[] = [
  { match: /ortak|shared|consensus|common/i, key: "ortak", icon: CheckCircle2, tone: "consensus" },
  { match: /ayrış|disagree|divergen|çeliş/i, key: "ayri", icon: Swords, tone: "divergence" },
  { match: /kısmi|partial/i, key: "kismi", icon: Users, tone: "partial" },
  { match: /benzersiz|unique|özgün/i, key: "uniq", icon: Sparkles, tone: "unique" },
  { match: /kör nokta|blind/i, key: "blind", icon: AlertTriangle, tone: "blind" },
  { match: /öneril|recommend|yaklaşım|approach|sonuç/i, key: "rec", icon: Target, tone: "recommend" }
];

function themeFor(title: string) {
  return ANALYSIS_THEMES.find((t) => t.match.test(title)) ?? { key: "x", icon: ChevronRight, tone: "default" };
}

function AnalysisCard({
  content,
  modelLabel,
  language
}: {
  content: string;
  modelLabel?: string;
  language: Language;
}) {
  const text = uiText[language];
  // "## Başlık\n gövde" bloklarına ayır.
  const blocks = content
    .split(/^\s*#{1,3}\s+/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const nl = b.indexOf("\n");
      const title = (nl === -1 ? b : b.slice(0, nl)).trim();
      const body = (nl === -1 ? "" : b.slice(nl + 1)).trim();
      return { title, body };
    })
    .filter((b) => b.title && !/code task brief|operatör/i.test(b.title));

  return (
    <div className="analysisCard">
      <div className="analysisHead">
        <Target size={15} />
        <strong>{modelLabel ?? text.operatorAnalysis}</strong>
      </div>
      {blocks.length ? (
        <div className="analysisAccordion">
          {blocks.map((b, i) => (
            <AnalysisAccordionItem key={i} title={b.title} body={b.body} defaultOpen={false} />
          ))}
        </div>
      ) : (
        <pre className="analysisRaw">{content}</pre>
      )}
    </div>
  );
}

// Tek bölüm: kapalıyken ikon + başlık + madde sayısı + önizleme; tıklanınca maddeler açılır.
function AnalysisAccordionItem({ title, body, defaultOpen }: { title: string; body: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const theme = themeFor(title);
  const Icon = theme.icon;
  const items = body
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
  const preview = items.join(" · ");
  return (
    <div className={`accItem ${theme.tone}${open ? " open" : ""}`}>
      <button className="accHead" onClick={() => setOpen((o) => !o)}>
        <Icon size={14} className="accIcon" />
        <span className="accTitle">{title}</span>
        {items.length > 0 && <span className="accCount">{items.length}</span>}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open ? (
        <ul className="accBody">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      ) : (
        preview && <div className="accPreview">{preview}</div>
      )}
    </div>
  );
}

// Tartışma bitince çıkan 3 aksiyon barı: Sohbete Devam / Operatöre Yaptır / Ekip Çalışması.
function DebateActionBar({
  language,
  onContinueChat,
  onOperatorBuild,
  onTeamWork
}: {
  language: Language;
  onContinueChat: () => void;
  onOperatorBuild: () => void;
  onTeamWork: () => void;
}) {
  const text = uiText[language];
  return (
    <div className="debateActionBar">
      <span className="debateActionHint">{text.debateDoneHint}</span>
      <div className="analysisActions">
        <button className="analysisActionBtn continue" onClick={onContinueChat}>
          <MessageCircle size={14} />
          {text.continueChat}
        </button>
        <button className="analysisActionBtn operator" onClick={onOperatorBuild}>
          <Target size={14} />
          {text.operatorBuild}
        </button>
        <button className="analysisActionBtn team" onClick={onTeamWork}>
          <Users size={14} />
          {text.teamWork}
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

// Chat alanındaki interaktif limit göstergesi: CLI'lerin kalan limitinin ortalamasını
// donut olarak gösterir; tıklayınca küçük bir popup'ta her CLI'nin limitleri çıkar.
function LimitGauge({ status, language }: { status: CliStatusResponse | null; language: Language }) {
  const text = uiText[language];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const tools = (status?.tools ?? []).filter((t) => t.usage?.windows?.length);
  // Her CLI için en kısıtlayıcı pencereden kalan; sonra ortalama.
  const remainings = tools.map((t) => 100 - Math.max(...t.usage!.windows.map((w) => w.usedPercent)));
  const avg = remainings.length ? Math.round(remainings.reduce((a, b) => a + b, 0) / remainings.length) : 0;
  const radius = 9;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - avg / 100);
  const color = avg <= 15 ? "#ef4444" : avg <= 40 ? "#f59e0b" : "#22c55e";

  return (
    <div className="limitGauge" ref={ref}>
      <button className="limitGaugeBtn" onClick={() => setOpen((o) => !o)} title={`${text.agentCenter}: %${avg}`}>
        <svg width="26" height="26" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r={radius} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="3" />
          <circle
            cx="12" cy="12" r={radius} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 12 12)"
          />
        </svg>
        <span className="limitGaugePct" style={{ color }}>{avg}</span>
      </button>
      {open && (
        <div className="limitPopup" onMouseDown={(e) => e.stopPropagation()}>
          <div className="limitPopupHead">
            <Zap size={13} />
            <span>{text.agentCenter}</span>
            <strong style={{ color }}>%{avg}</strong>
          </div>
          {tools.length === 0 && <p className="limitPopupEmpty">{text.readingCli}</p>}
          {tools.map((t) => (
            <div className="limitPopupRow" key={t.id}>
              <div className="limitPopupName">
                <span className={`agentIcon ${t.id}`}>{iconForTool(t.id)}</span>
                <strong>{displayToolName(t.id)}</strong>
              </div>
              {t.usage!.windows.map((w) => (
                <div className="limitMini" key={w.label}>
                  <div className="limitMiniHead"><span>{w.label}</span><span>%{w.usedPercent}</span></div>
                  <div className="limitMiniTrack">
                    <div
                      className={`limitMiniFill${w.usedPercent >= 90 ? " danger" : w.usedPercent >= 60 ? " warn" : ""}`}
                      style={{ width: `${w.usedPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
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
  onOpenFile,
  running
}: {
  events: RunEvent[];
  language: Language;
  onOpenFile?: (path: string) => void;
  running?: boolean;
}) {
  const text = uiText[language];
  const fileEvents = events.filter((event) => event.type.startsWith("file_"));
  const groups = groupAgentEvents(events);
  if (!groups.size && !fileEvents.length) return null;

  // Canlı akış: son 5 anlamlı olay (adım + dosya). Kullanıcıya "çalışıyor" hissi verir.
  const feed = events
    .filter((e) => e.type === "agent_step" || e.type === "file_created" || e.type === "file_changed" || e.type === "file_deleted")
    .slice(-5)
    .reverse();
  const lastFile = [...events].reverse().find((e) => e.type.startsWith("file_"));
  const currentFile = lastFile ? parseFileChange(lastFile).path : null;
  // Ajanın o an ne yaptığı (en son agent_step mesajı): "Claude ✍️ kodluyor: ...".
  const lastStep = [...events].reverse().find((e) => e.type === "agent_step")?.message?.replace(/\s+/g, " ") ?? null;

  return (
    <div className="agentActivitySection">
      {running && (
        <div className="liveProgress">
          <span className="liveSpinner" />
          <div className="liveProgressText">
            <span className="liveLabel">{lastStep ?? text.working}</span>
            {currentFile && <span className="liveFile">{currentFile}</span>}
          </div>
        </div>
      )}
      {feed.length > 0 && (
        <div className="liveFeed">
          {feed.map((e) => {
            const isFile = e.type.startsWith("file_");
            const label = isFile ? parseFileChange(e).path : e.message.replace(/\s+/g, " ");
            return (
              <button
                key={e.id}
                className={`liveFeedLine ${e.type}`}
                onClick={() => (isFile && onOpenFile ? onOpenFile(parseFileChange(e).path) : undefined)}
                title={label}
              >
                {isFile ? <FileIcon size={12} /> : <Cpu size={12} />}
                <span className="liveFeedText">{label.slice(0, 80)}</span>
                <time>{formatRunEventTime(e.createdAt)}</time>
              </button>
            );
          })}
        </div>
      )}
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
        <span className="explorerHeadActions">
          <button
            className="iconButton"
            disabled={!rootPath}
            onClick={() => {
              if (!rootPath) return;
              void fetch("/api/open-folder", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ path: rootPath })
              });
            }}
            title={text.openInExplorer}
          >
            <ExternalLink size={14} />
          </button>
          <button
            className="iconButton"
            disabled={!rootPath}
            onClick={() => { setLoading(true); loadDir().then((e) => { setRootEntries(e); setLoading(false); }); }}
            title={text.refresh}
          >
            <RefreshCw size={14} />
          </button>
        </span>
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
  width,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
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
  width: number;
  onWidthChange: (w: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
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
  const [shellMenu, setShellMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];

  // Komut satırı prefixi: çıktıdaki SON gerçek shell prompt'undan dizini canlı oku (cd ile güncellensin).
  const liveCwd = useMemo(() => {
    const out = active ? outputs[active.id] : "";
    if (!out) return active?.cwd ?? "";
    const matches = [...out.matchAll(/(?:PS\s+)?([A-Za-z]:\\[^\r\n>]*)>/g)];
    return matches.length ? matches[matches.length - 1][1].trim() : (active?.cwd ?? "");
  }, [active?.id, active?.cwd, outputs]);

  // + menüsü dışarı tıklayınca kapansın.
  useEffect(() => {
    if (!shellMenu) return;
    const close = () => setShellMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [shellMenu]);

  const copyOutput = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(outputs[active.id] || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // pano erişimi yoksa sessizce geç
    }
  };

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [outputs, active?.id]);

  // Terminal açılınca / sekme değişince input'a odaklan (gerçek terminal hissi).
  useEffect(() => {
    if (open && active) inputRef.current?.focus();
  }, [open, active?.id]);

  // Sol kenardan yatay sürükleyerek genişlik ayarı.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    onResizeStart();
    const move = (ev: PointerEvent) => {
      const delta = startX - ev.clientX; // sola sürükleyince genişler
      onWidthChange(Math.min(820, Math.max(300, startW + delta)));
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      onResizeEnd();
    };
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

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
      <div className="terminalResizer" onPointerDown={startResize} title={text.resizeTerminal} />
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
          <button className={`copyBtn terminalCopyBtn${copied ? " copied" : ""}`} onClick={copyOutput} title={copied ? text.copied : text.copyMessage}>
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>
          <div className="terminalNewWrap">
            <button
              className="iconButton terminalNewBtn"
              onClick={(e) => { e.stopPropagation(); setShellMenu((v) => !v); }}
              title={text.newTerminalTitle}
            >
              <Plus size={15} />
            </button>
            {shellMenu && (
              <div className="rowMenu terminalShellMenu" onMouseDown={(e) => e.stopPropagation()}>
                <button onClick={() => { setShellMenu(false); onCreate("powershell"); }}>
                  <SquareTerminal size={13} /> {text.newPowerShell}
                </button>
                <button onClick={() => { setShellMenu(false); onCreate("cmd"); }}>
                  <SquareTerminal size={13} /> {text.newCmd}
                </button>
              </div>
            )}
          </div>
          <button className="iconButton" onClick={onToggle} title={text.closeTerminal}>
            <X size={14} />
          </button>
        </div>
      </div>
      {active ? (
        <div className="terminalScreen" ref={outputRef} onClick={() => inputRef.current?.focus()}>
          <pre className="integratedTerminalOutput">{outputs[active.id] || ""}</pre>
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
            <span className="terminalPrompt">{active.shell === "cmd" ? `${liveCwd}>` : `PS ${liveCwd}>`}</span>
            <input
              ref={inputRef}
              autoFocus
              value={command}
              placeholder={text.terminalPlaceholder}
              onChange={(event) => setCommand(event.target.value)}
            />
          </form>
        </div>
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
  language, status, messages, value, selectedPlanner, selectedModel, modelOptions,
  selectedEffort, onEffortChange, selectedDetailLevel, onDetailLevelChange,
  mode, onModeChange, multiAvailable, cliOptions, singleCli, onSingleCliChange,
  thinking, onModelChange, onChange, onSend, onClear, onCreateBrief, onCreatePlan, onStart,
  onContinueChat, onOperatorBuild, debateDone, operatorAnalyzing, phasePending, onResumePhase,
  codingActive, onExitCoding,
  participantSources, participants, onParticipantsChange, debateRounds, onRoundsChange,
  operatorSel, onOperatorChange, analysisReady,
  runActive, onAddNote, onStopRun,
  attachments, onAddImage, onRemoveImage,
  conversations, activeConversationId, onOpenConversation, onDeleteConversation, onNewChat,
  projects, activeProjectId, onSwitchProject, onNewProject, onDeleteProject,
  run, events, onOpenFile, onTogglePreview, previewOpen, previewAvailable
}: {
  language: Language;
  status: CliStatusResponse | null;
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
  onContinueChat: () => void;
  onOperatorBuild: () => void;
  debateDone: boolean;
  operatorAnalyzing: string | null;
  phasePending: boolean;
  onResumePhase: () => void;
  codingActive: boolean;
  onExitCoding: () => void;
  participantSources: { cli: DebateParticipant; label: string; models: ModelOption[] }[];
  participants: { cli: DebateParticipant; model: string }[];
  onParticipantsChange: (next: { cli: DebateParticipant; model: string }[]) => void;
  debateRounds: number;
  onRoundsChange: (n: number) => void;
  operatorSel: { cli: DebateParticipant; model: string } | null;
  onOperatorChange: (op: { cli: DebateParticipant; model: string } | null) => void;
  analysisReady: boolean;
  onStart: () => void;
  runActive: boolean;
  onAddNote: (note: string) => void;
  onStopRun: () => void;
  attachments: { path: string; name: string; preview: string; isImage: boolean }[];
  onAddImage: (file: File) => void;
  onRemoveImage: (path: string) => void;
  conversations: StoredConversation[];
  activeConversationId: string;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewChat: () => void;
  projects: Project[];
  activeProjectId: string | null;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  run: Run | null;
  events: RunEvent[];
  onOpenFile?: (path: string) => void;
  onTogglePreview: () => void;
  previewOpen: boolean;
  previewAvailable: boolean;
}) {
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];
  const modeMeta = modeMetaByLanguage[language];
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useAutoGrow(value);
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  // Sohbet sekmesindeki ile birebir aynı sesli komut (dalga animasyonu + canlı yazı).
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const transcriptRef = useRef("");
  const sendAfterRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Date.now());
  const voiceSupported = typeof window !== "undefined" && Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

  function startVoice() {
    const Recognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!Recognition || listening) return;
    const recognition = new Recognition();
    recognition.lang = language === "tr" ? "tr-TR" : "en-US";
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
      const t = transcriptRef.current.trim();
      if (sendAfterRef.current) {
        const combined = value.trim() ? `${value.trim()} ${t}`.trim() : t;
        if (combined) onSend(combined);
      } else if (t) {
        onChange(value.trim() ? `${value.trim()} ${t}` : t);
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
      {previewAvailable && (
        <div className="codeChatFloatTools">
          <button className="ghostButton" onClick={onTogglePreview} title={text.togglePreview}>
            {previewOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            {text.preview}
          </button>
        </div>
      )}

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
        {messages.map((msg) =>
          msg.planner === "analysis" ? (
            <AnalysisCard
              key={msg.id ?? `${msg.role}-${msg.createdAt}`}
              content={msg.content}
              modelLabel={msg.modelLabel}
              language={language}
            />
          ) : (
            <article key={msg.id ?? `${msg.role}-${msg.createdAt}`} className={`chatBubble ${msg.role} compact`}>
              {msg.role === "assistant" && (
                <div className="messageMeta">
                  <Bot size={12} />
                  <span>{msg.modelLabel ?? "Orkestra"}</span>
                </div>
              )}
              <pre>{msg.content}</pre>
              <div className="bubbleFooter">
                <CopyButton value={msg.content} label={text.copyMessage} copiedLabel={text.copied} />
              </div>
            </article>
          )
        )}
        {/* Canlı aktivite (yapılan değişiklikler) mesajların hemen altında, aksiyon barlarının ÜSTÜNDE.
            Faz onayı beklerken spinner gösterme (run "awaiting" durumunda stale "kodluyor" çıkmasın). */}
        {run && <AgentActivitySection events={events} language={language} onOpenFile={onOpenFile} running={runActive && !phasePending} />}
        {operatorAnalyzing && (
          <div className="operatorAnalyzing">
            <span className="liveSpinner" />
            <Target size={14} />
            <span>{text.operatorAnalyzingLabel} · {operatorAnalyzing}</span>
          </div>
        )}
        {thinking && (
          <article className="chatBubble assistant thinking compact">
            <div className="typingDots"><span /><span /><span /></div>
          </article>
        )}
        {/* Aksiyon barları EN ALTTA: faz onayı veya tartışma-sonrası 3 buton. */}
        {phasePending && (
          <div className="phasePendingBar">
            <span className="phasePendingHint">{text.phaseDoneHint}</span>
            <button className="analysisActionBtn operator" onClick={onResumePhase}>
              <Play size={14} />
              {text.phaseContinue}
            </button>
            <button className="analysisActionBtn" onClick={onStopRun}>
              <X size={14} />
              {text.stop}
            </button>
          </div>
        )}
        {/* 3 buton: analiz kartı VARSA (operatöre/ekibe kart olmadan iş verilmesin), çalışma/kodlama/analiz
            yokken. codeDebateDone'a bağlı değil → oturum değişip dönünce kart varsa bar yine görünür. */}
        {!runActive && !codingActive && !operatorAnalyzing && messages.some((m) => m.planner === "analysis") && (
          <DebateActionBar
            language={language}
            onContinueChat={() => { onContinueChat(); composerRef.current?.focus(); composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
            onOperatorBuild={onOperatorBuild}
            onTeamWork={onCreatePlan}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="codeChatComposer">
        {codingActive && (
          <div className="codingModeBar">
            <span className="codingModeHint">⌨️ {text.codingModeHint}</span>
            <button className="ghostButton" onClick={onExitCoding} title={text.backToDebateTitle}>
              <Swords size={13} />
              {text.backToDebate}
            </button>
          </div>
        )}
        <div className="modeSwitch compact codeModeSwitch">
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
        {(mode === "debate" || mode === "multi") && (
          <div className="debateControls compact">
            <ModelPicker
              language={language}
              sources={participantSources}
              mode="multi"
              participants={participants}
              onParticipantsChange={onParticipantsChange}
            />
            {mode === "debate" && (
              <ModelPicker
                language={language}
                sources={participantSources}
                mode="single"
                selected={operatorSel}
                onSelect={onOperatorChange}
                allowNone
                triggerPrefix={text.operatorSelect}
                noneLabel={text.operatorNone}
              />
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach((file) => onAddImage(file));
            e.target.value = "";
          }}
        />
        <div className={`composerBox codeComposerBox${listening ? " recording" : ""}`}>
          {attachments.length > 0 && (
            <div className="attachmentRow">
              {attachments.map((item) => (
                <div className="attachmentChip" key={item.path}>
                  {item.isImage ? <img src={item.preview} alt={item.name} /> : <FileText size={13} className="attachmentFileIcon" />}
                  <span>{item.name}</span>
                  <button onClick={() => onRemoveImage(item.path)} title={text.removeAttachment}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
                ref={composerRef}
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
                rows={1}
              />
              <div className="composerBar">
                <div className="composerBarLeft">
                  <button className="iconRound" onClick={() => fileInputRef.current?.click()} title={text.addImage}>
                    <Plus size={16} />
                  </button>
                  {mode === "single" && (
                    <ModelPicker
                      language={language}
                      sources={participantSources}
                      mode="single"
                      selected={{ cli: singleCli, model: selectedModel }}
                      onSelect={(s) => { if (s) { onSingleCliChange(s.cli); onModelChange(s.model); } }}
                    />
                  )}
                  {mode === "single" && (
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
                  )}
                </div>
                <div className="composerBarRight">
                  <LimitGauge status={status} language={language} />
                  {voiceSupported && (
                    <button className="iconRound" onClick={startVoice} title={text.voiceInput}>
                      <Mic size={16} />
                    </button>
                  )}
                  {runActive ? (
                    value.trim() ? (
                      <button
                        className="iconRound sendCircle"
                        onClick={() => { onAddNote(value); onChange(""); }}
                        title={text.addNote}
                      >
                        <ArrowUp size={16} />
                      </button>
                    ) : (
                      <button
                        className="iconRound sendCircle stopCircle"
                        onClick={() => onStopRun()}
                        title={text.stop}
                      >
                        <Square size={14} />
                      </button>
                    )
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

// ─────────── Browser Preview ───────────

function BrowserPreview({ run, language, onClose }: { run: Run | null; language: Language; onClose: () => void }) {
  const text = uiText[language];
  const [refreshKey, setRefreshKey] = useState(0);
  const [entry, setEntry] = useState<string | null>(null);
  const [previewAvailable, setPreviewAvailable] = useState(false);
  // DOĞRUDAN backend (8787): göreli URL Vite SPA fallback'ine düşüp Orkestra arayüzünü gösteriyordu.
  // CORS backend'de açık. localhost→127.0.0.1 (IPv6 ::1 bağlantı reddini önler).
  const backendHost = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
  const backendOrigin = `${window.location.protocol}//${backendHost}:8787`;
  const previewUrl = run && entry ? `${backendOrigin}/preview/${run.id}/${entry}` : null;

  useEffect(() => {
    let cancelled = false;
    if (!run) {
      setEntry(null);
      setPreviewAvailable(false);
      return;
    }
    fetch(`${backendOrigin}/preview-entry/${run.id}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { entry?: string } | null) => {
        if (cancelled) return;
        if (data?.entry) {
          setEntry(data.entry);
          setPreviewAvailable(true);
        } else {
          setEntry(null);
          setPreviewAvailable(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntry(null);
          setPreviewAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [run?.id, refreshKey]);

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

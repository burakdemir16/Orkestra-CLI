import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  Bot,
  Code2,
  Download,
  GitCompare,
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
  Github,
  UploadCloud,
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
    antigravity: "Antigravity CLI"
  },
  tr: {
    auto: "Otomatik",
    all: "Tüm CLI'ler (Paralel)",
    debate: "Tartışma Panosu",
    codex: "OpenAI Codex",
    claude: "Claude Code",
    antigravity: "Antigravity CLI"
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
    cliSection: "CLIs",
    limitsTitle: "Limits",
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
    geminiVerified: "Antigravity verified",
    verified: "Verified",
    resets: "resets",
    staleUsage: "Showing cached usage (refreshing…)",
    limitNoCliData: "Usage isn't exposed by this CLI — visible inside its IDE.",
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
    setupTitle: "Orkestra Setup",
    setupWelcome: "Let's get Orkestra ready: choose preferences, install and sign in to the CLIs.",
    language: "Language",
    theme: "Theme",
    lightMode: "Light",
    darkMode: "Dark",
    back: "Back",
    stepLangTheme: "Preferences",
    stepInstall: "Install packages",
    stepAuth: "Sign in & test",
    stepAuthorize: "Authorization",
    stepDone: "Done",
    installLead: "Install the CLI packages needed for the agents.",
    install: "Install",
    reinstall: "Reinstall",
    installed: "Installed",
    installHint: "Installation runs in a new terminal. When it finishes, click Refresh.",
    installHintHeadless: "Installs run in the background (no window). agy may take 1–2 min.",
    installAll: "Install all",
    installingNow: "Installing…",
    installWarn: "Not installed (their agents can't be used until installed)",
    installNeedOne: "Install at least one CLI to continue (the others can be installed later).",
    authLead: "Sign in to each CLI and test it.",
    authorizedOk: "Signed in",
    notAuthorized: "Not signed in",
    authHint: "Login opens a terminal; complete it there, then Test.",
    authHintLive: "Login opens in your browser; completion is detected automatically (no Refresh needed).",
    waitingLogin: "Waiting for login…",
    loginStep1: "Open the authentication link in your browser and sign in.",
    openBrowser: "Open in browser",
    loginWaitingUrl: "Waiting for the authentication link…",
    loginStep2: "Paste the code from the browser here and send it.",
    pasteCode: "Paste the verification code",
    loginRawOutput: "Terminal output",
    loginTermHint: "Use the buttons (or click the terminal and type) to navigate: ↑/↓ to move, Enter to confirm.",
    spaceKey: "Space",
    enterKey: "Enter",
    loginPasteHint: "Open the link, copy the code shown in the browser, paste it here and press Send.",
    loginKbdHint: "Click the terminal to type. Navigate with ↑/↓ (and ←/→ between buttons), Enter to confirm.",
    loginWindowIntro: "A real terminal window opens. Do these steps there (the window closes itself when done):",
    openLoginWindow: "Open login window",
    opening: "Opening…",
    loginWindowOpened: "Window opened — finish the steps there. Sign-in is detected automatically and the window closes.",
    reopenWindow: "Reopen window",
    guideMethodTitle: "Choose login method",
    guideMethod: "‘Google OAuth’ is already selected — just press Enter.",
    guideDeviceTitle: "Sign in with Google",
    guideDevice: "The browser opens; sign in. Copy the code on the page, paste it into the terminal and press Enter.",
    guideColorTitle: "Choose a color scheme",
    guideColor: "Pick a theme with ↑/↓ and press Enter.",
    guideTosTitle: "Accept the Terms",
    guideTos: "[Done] is already selected (green) — press Enter. To decline telemetry, press Space on the checkbox first.",
    guideTrustTitle: "Trust the folder",
    guideTrust: "Confirm trusting the folder (Enter). Sign-in completes and the window closes.",
    guideSimpleBrowserTitle: "Sign in in the browser",
    guideSimpleBrowser: "The browser opens; sign in (paste the code if the terminal asks).",
    guideSimpleDoneTitle: "Done",
    guideSimpleDone: "When sign-in completes, the window closes automatically.",
    loginAutoDetect: "When login completes, it's detected automatically — no separate terminal needed.",
    loginDone: "Signed in!",
    authorizeTitle: "Agent authorization",
    authorizeDesc: "Agents run with full access so they can work without interruptions:",
    authorizeItem1: "Trust the working folder",
    authorizeItem2: "Act without per-action approval prompts",
    authorizeItem3: "Read/write files & run commands in the workspace",
    authorizeConfirm: "I grant the agents full access.",
    setupDoneTitle: "Setup complete!",
    notReady: "Not ready",
    needOneCli: "At least one CLI must be installed and signed in to continue.",
    startApp: "Start using Orkestra",
    settings: "Settings",
    settingsTitle: "Settings",
    resetSetup: "Reset & re-run setup",
    resetSetupDesc: "Re-open the first-launch setup wizard (install / sign-in / preferences).",
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
    openExistingProject: "Open an existing folder as a project",
    addProject: "Add project",
    createNewProject: "Create new project",
    openExistingShort: "Open existing folder",
    newSessionTitle: "New session in this project",
    moreActions: "More",
    deleteProject: "Delete project",
    deleteProjectConfirm: "Delete this project from the list? (files are not deleted)",
    openInExplorer: "Open folder in file manager",
    openInVscode: "Open in VS Code",
    changes: "Changes",
    noChanges: "No changes yet.",
    binaryFile: "Binary file — not shown.",
    previewInstalling: "Installing dependencies… (first run may take a while)",
    previewStarting: "Starting the dev server…",
    previewError: "Couldn't start the preview. Check the terminal/logs.",
    notifChatDoneTitle: "Response ready",
    notifPhaseTitle: "Phase done — needs your approval",
    notifActionTitle: "Analysis ready — how should we proceed?",
    notifActionBody: "Start the team or have the operator build it.",
    notifCodeDoneTitle: "Coding finished ✅",
    notifCodeDoneBody: "The agents completed the task.",
    notifErrorTitle: "An error occurred ⚠️",
    notifActOperator: "Operator build",
    notifActTeamStart: "Team: Start",
    notifActTeamReview: "Review plan",
    notifEnableTitle: "Enable notifications",
    notifEnableDesc: "Get notified when responses finish, a phase needs approval, coding completes, or an error occurs.",
    notifEnableBtn: "Enable",
    notifEnableLater: "Not now",
    exportPdf: "Download as PDF",
    exportWord: "Download as Word",
    exportMd: "Download as .md",
    exportTxt: "Download as .txt",
    exportExcel: "Download as Excel",
    transferToCode: "Move to Coding",
    transferToCodeTitle: "Carry this chat plan into Code mode",
    collapseCard: "Collapse",
    expandCard: "Expand",
    download: "Download",
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
    pausedHint: "Paused — resume where you left off?",
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
    githubSection: "GitHub",
    githubConnect: "Connect",
    githubDisconnect: "Disconnect",
    githubConnecting: "Connecting…",
    githubTokenPlaceholder: "Paste a Personal Access Token (repo scope)",
    githubConnectedAs: "Connected as",
    githubTokenHint: "Create a token at github.com/settings/tokens (repo scope).",
    githubCloneTitle: "Clone from GitHub",
    githubCloneUrlPrompt: "GitHub repository URL",
    githubCloneUrlPlaceholder: "https://github.com/owner/repo.git",
    githubPush: "Push to GitHub",
    githubRepoNamePrompt: "New repository name",
    githubRepoPrivatePrompt: "Make it private?",
    githubNotConnected: "Connect GitHub in Settings first.",
    githubPushedTo: "Pushed to GitHub:",
    githubClonedDone: "Repository cloned.",
    githubInvalidToken: "Token invalid or insufficient scope.",
    githubConnectWith: "Connect with GitHub",
    githubDevicePrompt: "Enter this code in the browser:",
    githubOpenBrowser: "Open browser",
    githubWaiting: "Waiting for approval…",
    githubCodeCopied: "Code copied — paste it on the page.",
    githubClientIdSetup: "One-time setup: OAuth App Client ID",
    githubClientIdPlaceholder: "OAuth App Client ID",
    githubCreateAppHint: "Create an OAuth App (tick \"Enable Device Flow\") and paste its Client ID here. You only do this once; it is public, not a secret.",
    githubCreateAppLink: "Create OAuth App",
    githubSave: "Save",
    githubAdvancedToken: "Connect with a token instead",
    githubBackToDevice: "Back to one-click connect",
    githubNoActiveProject: "Select a project first to push it.",
    githubPushExisting: "Push to an existing repo (URL)",
    githubPushExistingHint: "Paste an existing GitHub repo URL — Orkestra commits and pushes this project there.",
    githubRepoUrlPlaceholder: "https://github.com/owner/repo",
    githubCreateNew: "Create a new repo",
    githubLinkedRepo: "Linked repo",
    githubPushUpdate: "Push update",
    githubChangeRepo: "Send to a different repo",
    githubMenuItem: "GitHub",
    attachMenuFile: "Upload photo or file",
    reviewChanges: "Review changes (all turns)",
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
    cliSection: "CLI'lar",
    limitsTitle: "Limitler",
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
    geminiVerified: "Antigravity doğrulandı",
    verified: "Doğrulandı",
    resets: "sıfırlanır",
    staleUsage: "Önbellekten gösteriliyor (yenileniyor…)",
    limitNoCliData: "Kullanım bu CLI'dan okunamıyor — IDE içinde görünür.",
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
    setupTitle: "Orkestra Kurulumu",
    setupWelcome: "Orkestra'yı hazırlayalım: tercihleri seç, CLI'leri kur ve giriş yap.",
    language: "Dil",
    theme: "Tema",
    lightMode: "Açık",
    darkMode: "Koyu",
    back: "Geri",
    stepLangTheme: "Tercihler",
    stepInstall: "Paket kurulumu",
    stepAuth: "Giriş & test",
    stepAuthorize: "Yetkilendirme",
    stepDone: "Bitti",
    installLead: "Ajanlar için gerekli CLI paketlerini kur.",
    install: "Kur",
    reinstall: "Yeniden kur",
    installed: "Kurulu",
    installHint: "Kurulum yeni bir terminalde çalışır. Bitince Yenile'ye bas.",
    installHintHeadless: "Kurulumlar arka planda (penceresiz) çalışır. agy 1–2 dk sürebilir.",
    installAll: "Tümünü Kur",
    installingNow: "Kuruluyor…",
    installWarn: "Kurulmadı (ajanları kurulmadan kullanılamaz)",
    installNeedOne: "Devam etmek için en az bir CLI kur (diğerleri sonra kurulabilir).",
    authLead: "Her CLI'ye giriş yap ve test et.",
    authorizedOk: "Giriş yapıldı",
    notAuthorized: "Giriş yapılmadı",
    authHint: "Giriş bir terminal açar; orada tamamla, sonra Test et.",
    authHintLive: "Giriş tarayıcıda açılır; tamamlanınca otomatik algılanır (Yenile gerekmez).",
    waitingLogin: "Giriş bekleniyor…",
    loginStep1: "Doğrulama linkini tarayıcıda aç ve giriş yap.",
    openBrowser: "Tarayıcıda aç",
    loginWaitingUrl: "Doğrulama linki bekleniyor…",
    loginStep2: "Tarayıcıdaki kodu buraya yapıştırıp gönder.",
    pasteCode: "Doğrulama kodunu yapıştır",
    loginRawOutput: "Terminal çıktısı",
    loginTermHint: "Butonlarla (veya terminale tıklayıp klavyeyle) gez: ↑/↓ taşı, Enter onayla.",
    spaceKey: "Boşluk",
    enterKey: "Enter",
    loginPasteHint: "Linki aç, tarayıcıdaki kodu kopyala, buraya yapıştır ve Gönder'e bas.",
    loginKbdHint: "Yazmak için terminale tıkla. ↑/↓ ile gez (butonlar arası ←/→), Enter ile onayla.",
    loginWindowIntro: "Gerçek bir terminal penceresi açılacak. Adımları orada yap (bitince pencere kendiliğinden kapanır):",
    openLoginWindow: "Giriş penceresini aç",
    opening: "Açılıyor…",
    loginWindowOpened: "Pencere açıldı — adımları orada tamamla. Giriş otomatik algılanır ve pencere kapanır.",
    reopenWindow: "Yeniden aç",
    guideMethodTitle: "Giriş yöntemini seç",
    guideMethod: "‘Google OAuth’ zaten seçili gelir — sadece Enter'a bas.",
    guideDeviceTitle: "Google ile giriş yap",
    guideDevice: "Tarayıcı açılır; giriş yap. Sayfadaki kodu kopyala, terminale yapıştır, Enter'a bas.",
    guideColorTitle: "Renk şeması seç",
    guideColor: "↑/↓ ile bir tema seç, Enter'a bas.",
    guideTosTitle: "Şartları kabul et",
    guideTos: "[Done] zaten seçili gelir (yeşil) — Enter'a bas. Telemetri istemezsen önce onay kutusunda Boşluk'a bas.",
    guideTrustTitle: "Klasörü güven (Trust folder)",
    guideTrust: "Klasörü güvenmeyi onayla (Enter). Giriş tamamlanır ve pencere kapanır.",
    guideSimpleBrowserTitle: "Tarayıcıda giriş yap",
    guideSimpleBrowser: "Tarayıcı açılır; giriş yap (terminal isterse kodu yapıştır).",
    guideSimpleDoneTitle: "Bitti",
    guideSimpleDone: "Giriş tamamlanınca pencere otomatik kapanır.",
    loginAutoDetect: "Giriş tamamlanınca otomatik algılanır — ayrı terminal gerekmez.",
    loginDone: "Giriş yapıldı!",
    authorizeTitle: "Ajan yetkilendirme",
    authorizeDesc: "Ajanlar kesintisiz çalışabilmek için tam erişimle çalışır:",
    authorizeItem1: "Çalışma klasörünü güven (trust folder)",
    authorizeItem2: "Her işlem için ayrı onay sormadan çalış",
    authorizeItem3: "Workspace'te dosya okuma/yazma ve komut çalıştırma",
    authorizeConfirm: "Ajanlara tam erişim veriyorum.",
    setupDoneTitle: "Kurulum tamamlandı!",
    notReady: "Hazır değil",
    needOneCli: "Devam etmek için en az bir CLI kurulu ve giriş yapılmış olmalı.",
    startApp: "Orkestra'yı kullanmaya başla",
    settings: "Ayarlar",
    settingsTitle: "Ayarlar",
    resetSetup: "Sıfırla & sihirbazı çalıştır",
    resetSetupDesc: "İlk açılış kurulum sihirbazını yeniden aç (kurulum / giriş / tercihler).",
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
    openExistingProject: "Mevcut bir klasörü proje olarak aç",
    addProject: "Proje ekle",
    createNewProject: "Yeni proje oluştur",
    openExistingShort: "Mevcut klasör aç",
    newSessionTitle: "Bu projede yeni oturum",
    moreActions: "Daha fazla",
    deleteProject: "Projeyi sil",
    deleteProjectConfirm: "Bu proje listeden silinsin mi? (dosyalar silinmez)",
    openInExplorer: "Klasörü dosya yöneticisinde aç",
    openInVscode: "VS Code'da aç",
    changes: "Değişiklikler",
    noChanges: "Henüz değişiklik yok.",
    binaryFile: "İkili dosya — gösterilmiyor.",
    previewInstalling: "Bağımlılıklar kuruluyor… (ilk seferde biraz sürebilir)",
    previewStarting: "Dev sunucusu başlatılıyor…",
    previewError: "Önizleme başlatılamadı. Terminal/loglara bakın.",
    notifChatDoneTitle: "Cevap hazır",
    notifPhaseTitle: "Faz tamamlandı — onayın gerekiyor",
    notifActionTitle: "Analiz hazır — nasıl ilerleyelim?",
    notifActionBody: "Ekibi başlat ya da operatöre yaptır.",
    notifCodeDoneTitle: "Kodlama tamamlandı ✅",
    notifCodeDoneBody: "Ajanlar görevi tamamladı.",
    notifErrorTitle: "Bir hata oluştu ⚠️",
    notifActOperator: "Operatöre yaptır",
    notifActTeamStart: "Ekip: Başlat",
    notifActTeamReview: "Planı incele",
    notifEnableTitle: "Bildirimleri aç",
    notifEnableDesc: "Cevaplar bitince, faz onay bekleyince, kodlama tamamlanınca veya hata olunca haberin olsun.",
    notifEnableBtn: "İzin ver",
    notifEnableLater: "Şimdi değil",
    exportPdf: "PDF olarak indir",
    exportWord: "Word olarak indir",
    exportMd: ".md olarak indir",
    exportTxt: ".txt olarak indir",
    exportExcel: "Excel olarak indir",
    transferToCode: "Kodlamaya aktar",
    transferToCodeTitle: "Bu sohbet planını Code moduna taşı",
    collapseCard: "Daralt",
    expandCard: "Genişlet",
    download: "İndir",
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
    pausedHint: "Duraklatıldı — kaldığın yerden devam et?",
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
    githubSection: "GitHub",
    githubConnect: "Bağlan",
    githubDisconnect: "Bağlantıyı kes",
    githubConnecting: "Bağlanıyor…",
    githubTokenPlaceholder: "Personal Access Token yapıştır (repo yetkisi)",
    githubConnectedAs: "Bağlı:",
    githubTokenHint: "github.com/settings/tokens adresinden 'repo' yetkili token oluştur.",
    githubCloneTitle: "GitHub'dan klonla",
    githubCloneUrlPrompt: "GitHub depo URL'si",
    githubCloneUrlPlaceholder: "https://github.com/sahip/depo.git",
    githubPush: "GitHub'a gönder",
    githubRepoNamePrompt: "Yeni depo adı",
    githubRepoPrivatePrompt: "Özel (private) olsun mu?",
    githubNotConnected: "Önce Ayarlar'dan GitHub'a bağlan.",
    githubPushedTo: "GitHub'a gönderildi:",
    githubClonedDone: "Depo klonlandı.",
    githubInvalidToken: "Token geçersiz veya yetkisi yetersiz.",
    githubConnectWith: "GitHub ile Bağlan",
    githubDevicePrompt: "Tarayıcıda bu kodu gir:",
    githubOpenBrowser: "Tarayıcıda aç",
    githubWaiting: "Onay bekleniyor…",
    githubCodeCopied: "Kod kopyalandı — açılan sayfaya yapıştır.",
    githubClientIdSetup: "Tek seferlik kurulum: OAuth App Client ID",
    githubClientIdPlaceholder: "OAuth App Client ID",
    githubCreateAppHint: "Bir OAuth App oluştur (\"Enable Device Flow\" işaretle) ve Client ID'sini buraya yapıştır. Bunu yalnızca bir kez yaparsın; gizli değil, herkese açık bir numaradır.",
    githubCreateAppLink: "OAuth App oluştur",
    githubSave: "Kaydet",
    githubAdvancedToken: "Bunun yerine token ile bağlan",
    githubBackToDevice: "Tek tıkla bağlanmaya dön",
    githubNoActiveProject: "Göndermek için önce bir proje seç.",
    githubPushExisting: "Var olan repoya gönder (URL)",
    githubPushExistingHint: "Var olan bir GitHub repo URL'si yapıştır — Orkestra bu projeyi commit edip oraya push eder.",
    githubRepoUrlPlaceholder: "https://github.com/sahip/depo",
    githubCreateNew: "Yeni repo oluştur",
    githubLinkedRepo: "Bağlı depo",
    githubPushUpdate: "Güncellemeyi gönder",
    githubChangeRepo: "Başka repoya gönder",
    githubMenuItem: "GitHub",
    attachMenuFile: "Fotoğraf veya dosya yükle",
    reviewChanges: "Değişiklikleri incele (tüm turlar)",
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


// Backend (8787) tsx-watch ile yeniden başlarken ~1-2sn kapalı kalır; bu pencerede istekler
// 503 (vite proxy "backend restarting") veya ağ hatası verir. Geçici durum → kısa retry ile
// dayanıklı yap (aksi halde "yeni proje eklenemiyor" gibi sessiz başarısızlıklar oluşur).
async function fetchWithRetry(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 503 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      return response;
    } catch (err) {
      // Kasıtlı iptal (stop/interrupt) → hemen fırlat, tekrar deneme.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      throw err;
    }
  }
}

const api = {
  async get<T>(url: string): Promise<T> {
    const response = await fetchWithRetry(url);
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  },
  async post<T>(url: string, body: unknown = {}, signal?: AbortSignal): Promise<T> {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
};

// ─────────── Bildirimler (OS / Service Worker) ───────────
let swRegistration: ServiceWorkerRegistration | null = null;
type NotifyAction = { action: string; title: string };
type NotifyData = { kind?: string; view?: "chat" | "code"; convoId?: string | null; runId?: string | null };

const notificationsSupported = typeof window !== "undefined" && "Notification" in window;

function notificationPermission(): NotificationPermission {
  return notificationsSupported ? Notification.permission : "denied";
}

async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// OS bildirimi gösterir. Pencere ODAKTAYSA gösterme (kullanıcı zaten ekranı görüyor).
// Aksiyon butonları yalnızca Service Worker üzerinden çalışır; yoksa butonsuz gösterilir.
async function showNotify(opts: { title: string; body: string; tag?: string; data?: NotifyData; actions?: NotifyAction[] }) {
  if (notificationPermission() !== "granted") return;
  if (typeof document !== "undefined" && document.hasFocus()) return;
  const options: NotificationOptions & { actions?: NotifyAction[] } = {
    body: opts.body,
    tag: opts.tag,
    data: opts.data,
    icon: "/logo.png",
    badge: "/logo.png"
  };
  try {
    if (swRegistration) {
      if (opts.actions) options.actions = opts.actions;
      await swRegistration.showNotification(opts.title, options);
    } else {
      new Notification(opts.title, options);
    }
  } catch {
    try { new Notification(opts.title, options); } catch { /* yoksay */ }
  }
}

// ─────────── Belge dışa aktarma (istemci tarafı, sıfır bağımlılık) ───────────
// Basit markdown→HTML (başlık, liste, kod, kalın/italik, link). Dışa aktarma için yeterli.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = [];
  let inCode = false;
  let code: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (/^```/.test(line)) {
      if (inCode) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = []; inCode = false; }
      else { flushP(); flushL(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushP(); flushL(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushP();
      const t = ul ? "ul" : "ol";
      if (list !== t) { flushL(); out.push(`<${t}>`); list = t; }
      out.push(`<li>${inline(ul ? ul[1] : ol![1])}</li>`);
      continue;
    }
    if (!line.trim()) { flushP(); flushL(); continue; }
    para.push(line);
  }
  if (inCode) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flushP(); flushL();
  return out.join("\n");
}

const DOC_CSS =
  "body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:820px;margin:28px auto;padding:0 28px;}h1,h2,h3,h4{line-height:1.25;margin:1.2em 0 .5em;}code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:.92em;}pre{background:#f6f8fa;padding:12px 14px;border-radius:8px;overflow:auto;}pre code{background:none;padding:0;}a{color:#2563eb;}ul,ol{padding-left:22px;}blockquote{border-left:3px solid #d1d5db;margin:0;padding-left:14px;color:#555;}";

// Belge başlığı: ilk başlık ya da ilk anlamlı satır.
function docTitle(md: string): string {
  const first = md.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l.length > 0) ?? "belge";
  return first.replace(/[*`_]/g, "").slice(0, 60);
}

// Dosya adı: Türkçe/Unicode harfleri KORUR (\w ö/ü/ç/ş/ğ/ı'yı silip alt çizgi yapıyordu).
function safeFileName(md: string, ext: string): string {
  const base = docTitle(md)
    .replace(/[^\p{L}\p{N}._ -]+/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "belge";
  return `${base}.${ext}`;
}

// PDF: stilli HTML'i html2pdf ile GERÇEK bir .pdf dosyasına döküp indirir
// (Türkçe karakterler doğru render olur; jsPDF'in standart fontu Türkçe'yi bozuyordu).
async function exportAsPdf(md: string) {
  const { default: html2pdf } = await import("html2pdf.js"); // ağır kütüphane — sadece tıklayınca yüklenir
  // STRING modu: container'ı html2pdf kendi konumlandırır (manuel ekran-dışı koyunca html2canvas
  // BOŞ yakalıyordu). AÇIK renkleri açıkça ver (koyu tema mirası → beyaz-üstü-beyaz boş PDF'i önler).
  const html =
    `<div style="color:#1a1a1a;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;padding:24px 30px;width:720px;">` +
    mdToHtml(md) +
    `</div>`;
  try {
    await html2pdf()
      .set({
        filename: safeFileName(md, "pdf"),
        margin: [12, 12, 12, 12],
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      })
      .from(html, "string")
      .save();
  } catch (err) {
    console.error("[Orkestra] PDF oluşturulamadı:", err);
  }
}

// Markdown: ham içeriği .md olarak indir.
function exportAsMd(md: string) {
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safeFileName(md, "md");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Word: HTML tabanlı .doc indir (Word açar, düzenlenebilir).
function exportAsWord(md: string) {
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><style>${DOC_CSS}</style></head><body>${mdToHtml(md)}</body></html>`;
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safeFileName(md, "doc");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Markdown'ı düz metne indirger (txt için).
function stripMd(md: string): string {
  return md
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^```.*$/gm, "");
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// TXT: düz metin indir.
function exportAsTxt(md: string) {
  downloadBlob(stripMd(md), "text/plain;charset=utf-8", safeFileName(md, "txt"));
}

// İçeriği elektronik tablo satırlarına çevirir: markdown tablosu varsa onu; yoksa başlık + her satır bir hücre.
function mdToRows(md: string): string[][] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const tableRows = lines.filter((l) => l.includes("|") && l.trim());
  if (tableRows.length >= 2 && /^\s*\|?[\s:|-]+\|/.test(tableRows[1] ?? "")) {
    return tableRows
      .filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
      .map((l) => l.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => stripMd(c).trim()));
  }
  return lines.map((l) => stripMd(l).trim()).filter((l) => l).map((l) => [l]);
}

// Excel: HTML tablo tabanlı .xls (Excel açar). Sıfır bağımlılık.
function exportAsExcel(md: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = mdToRows(md);
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel'><head><meta charset='utf-8'></head><body><table border='1'>${body}</table></body></html>`;
  downloadBlob("﻿" + html, "application/vnd.ms-excel", safeFileName(md, "xls"));
}

// Kullanıcı mesajı bir belge/dosya çıktısı mı istiyor + hangi format?
function docExportIntent(msg: string): { md: boolean; txt: boolean; word: boolean; pdf: boolean; excel: boolean } {
  const m = (msg || "").toLocaleLowerCase("tr");
  if (!/(ver|indir|oluştur|hazırla|kaydet|olarak|yap)/.test(m)) return { md: false, txt: false, word: false, pdf: false, excel: false };
  const md = /(\bmd\b|markdown|\.md)/.test(m);
  const txt = /(\btxt\b|\.txt|düz metin)/.test(m);
  const pdf = /\bpdf\b/.test(m);
  const excel = /(excel|xlsx?|elektronik tablo|spreadsheet|tablo)/.test(m);
  // Word: açıkça word/docx/belge/doküman; ya da format belirtmeden sadece "dosya" dediyse varsayılan.
  const word = /(word|docx?|belge|doküman)/.test(m) || (/dosya/.test(m) && !md && !txt && !pdf && !excel);
  return { md, txt, word, pdf, excel };
}

// Açık "kodlamaya aktar" komutu mu? (deterministik tetikleyici — model kararı beklemeden)
function transferCommandIntent(msg: string): boolean {
  const m = (msg || "").toLocaleLowerCase("tr");
  return /(kodlama(ya)?\s*(at|geç|gec|aktar|moduna)|koda\s*(geç|gec|aktar|at)|bunu\s*kodla|kodlamaya\s*başla|\bbuild\b)/.test(m);
}

// Modelin yetenek sırası (en gelişmiş operatör/varsayılan seçimi için).
function modelRank(modelId: string, modelLabel: string): number {
  const s = `${modelId} ${modelLabel}`.toLowerCase();
  if (/opus/.test(s)) return 100;
  if (/sonnet/.test(s)) return 90;
  if (/gpt-?5|o3|o1[- ]?pro/.test(s)) return 85;
  if (/gemini.*(2\.5|3).*pro|gemini.*pro/.test(s)) return 80;
  if (/gpt-?4|codex/.test(s)) return 70;
  if (/mini|flash|haiku|oss|nano|lite|low/.test(s)) return 40;
  return 55;
}

type DocIntent = ReturnType<typeof docExportIntent>;

// Önizlemeli belge artifact kartı (ChatGPT/Claude tarzı): başlık + indir + içerik önizleme.
function DocArtifact({ content, intent, language }: { content: string; intent: DocIntent; language: Language }) {
  const text = uiText[language];
  const [open, setOpen] = useState(true);
  const ext = intent.excel ? "xlsx" : intent.pdf ? "pdf" : intent.md ? "md" : intent.txt ? "txt" : "docx";
  const name = safeFileName(content, ext);
  const rows = intent.excel ? mdToRows(content) : null;
  return (
    <div className="artifactCard">
      <div className="artifactHead">
        <FileText size={15} className="artifactIcon" />
        <span className="artifactName">{name}</span>
        <div className="artifactActions">
          {intent.md && <button onClick={() => exportAsMd(content)} title={text.exportMd}><Download size={14} /> md</button>}
          {intent.txt && <button onClick={() => exportAsTxt(content)} title={text.exportTxt}><Download size={14} /> txt</button>}
          {intent.excel && <button onClick={() => exportAsExcel(content)} title={text.exportExcel}><Download size={14} /> xls</button>}
          {intent.pdf && <button onClick={() => void exportAsPdf(content)} title={text.exportPdf}><Download size={14} /> pdf</button>}
          {intent.word && <button onClick={() => exportAsWord(content)} title={text.exportWord}><Download size={14} /> doc</button>}
          <button className="artifactToggle" onClick={() => setOpen((o) => !o)} title={open ? text.collapseCard : text.expandCard}>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="artifactBody">
          {rows ? (
            <table className="artifactTable"><tbody>{rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => (<td key={ci}>{c}</td>))}</tr>
            ))}</tbody></table>
          ) : (
            <div className="artifactDoc" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />
          )}
        </div>
      )}
    </div>
  );
}

type StoredConversation = { id: string; title: string; messages: ChatMessage[]; updatedAt: string; workspacePath?: string | null; projectId?: string | null; codingActive?: boolean; phasePendingRunId?: string | null; lastRunId?: string | null };
// Proje: kalıcı bir kod tabanı/klasör. Her projenin kendi oturum (konuşma) geçmişi olur.
type Project = { id: string; name: string; workspacePath: string; createdAt: string };
// Sunucudaki GitService.DiffFile ile aynı şekil (working-tree diff).
type DiffFile = { path: string; adds: number; dels: number; diff: string; binary: boolean };
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
  // Light modu kaldırıldı — uygulama her zaman dark. (Eski "light" kaydı yok sayılır.)
  const [theme, setTheme] = useState<"light" | "dark">("dark");

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

  // ── Bildirim izni + Service Worker + aksiyon dağıtıcı ──
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(notificationPermission());
  const notifActionRef = useRef<(action: string, data: NotifyData) => void>(() => {});
  notifActionRef.current = (action, data) => {
    // Faz onayı: girdi gerektirmez → doğrudan resume + canlı bağlan.
    if (action === "phase-continue" && data.runId) {
      const rid = data.runId;
      void api.post(`/api/runs/${rid}/resume`).then(() => { void reconnectRun(rid); }).catch(() => {});
      return;
    }
    if (data.view) setActiveView(data.view);
    // Farklı bir oturumun bildirimi: önce o oturumu aç (ağır aksiyonu stale state'le tetikleme).
    if (data.convoId && data.convoId !== conversationId) {
      openConversation(data.convoId);
      return;
    }
    if (action === "operator-build") void operatorBuild();
    else if (action === "team-start") void createPlan(true);
    else if (action === "team-review") void createPlan(false);
  };
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => { swRegistration = reg; }).catch(() => {});
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "orkestra-notification") notifActionRef.current(e.data.action, e.data.data ?? {});
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
  // İzin yoksa GÜNDE BİR kez sor (kullanıcı tarayıcıda kalıcı engellemediyse). Banner App içinde.
  const [notifAskToday, setNotifAskToday] = useState(false);
  useEffect(() => {
    if (!notificationsSupported) return;
    if (notificationPermission() === "granted") return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("orkestra.notifAsked") !== today) setNotifAskToday(true);
  }, []);
  const askNotificationPermission = async () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem("orkestra.notifAsked", today);
    const perm = await requestNotificationPermission();
    setNotifPerm(perm);
    setNotifAskToday(false);
  };

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
  // Düşünürken stop/interrupt için: o an uçuşan chat/debate isteğinin AbortController'ı.
  const chatAbortRef = useRef<AbortController | null>(null);
  // Artımlı bağlam özeti önbelleği (konuşma id → {summary, upto}). Oturum içi; reload'da yeniden kurulur.
  const summaryCacheRef = useRef<Map<string, { summary: string; upto: number }>>(new Map());
  // Düşünmeyi durdur (stop butonu): isteği iptal et, yarım çıktıyı bırak.
  function stopThinking() {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setIsThinking(false);
  }
  const [cliStatus, setCliStatus] = useState<CliStatusResponse | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Hata/bilgi mesajları artık baloncuk yerine gerçek browser console'una gider.
  useEffect(() => {
    if (notice) console.error("[Orkestra]", notice);
  }, [notice]);
  // İlk açılış kurulum sihirbazı tamamlandı mı?
  const [setupDone, setSetupDone] = useState<boolean>(() => localStorage.getItem("orkestra.setupDone") === "1");
  // Ayarlar dialog'u açık mı?
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubPushBusy, setGithubPushBusy] = useState(false);
  // GitHub işlemleri için görünür geri bildirim (kısa süreli toast).
  const [githubToast, setGithubToast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!githubToast) return;
    const t = setTimeout(() => setGithubToast(null), 5000);
    return () => clearTimeout(t);
  }, [githubToast]);
  const [loginModal, setLoginModal] = useState<{ tool: CliToolStatus } | null>(null);
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
  // Diff paneli (sağ alan; terminal ile karşılıklı dışlayan).
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  // Birikmiş değişiklik sayısı (tüm turlar) — İncele satırı yalnızca >0 ise görünür.
  const [cumulativeChanges, setCumulativeChanges] = useState(0);
  // Diff önbelleği: aynı (ws + değişiklik sayacı) için tekrar hesaplama → İncele anında açılır.
  const diffCacheRef = useRef<{ key: string; files: DiffFile[] } | null>(null);
  // Uçuştaki diff istekleri (ön-yükleme + İncele aynı anahtarı paylaşsın → çift hesaplama/yarış yok).
  const diffInflightRef = useRef<Map<string, Promise<DiffFile[]>>>(new Map());
  // Tek diff getirici: önbellek → uçuştaki istek → yeni istek. Sonucu önbelleğe yazar.
  const fetchDiff = useCallback((ws: string, key: string): Promise<DiffFile[]> => {
    if (diffCacheRef.current?.key === key) return Promise.resolve(diffCacheRef.current.files);
    const existing = diffInflightRef.current.get(key);
    if (existing) return existing;
    const p = api.post<{ files: DiffFile[] }>("/api/git/diff", { workspacePath: ws })
      .then((r) => { const files = r.files ?? []; diffCacheRef.current = { key, files }; return files; })
      .finally(() => diffInflightRef.current.delete(key));
    diffInflightRef.current.set(key, p);
    return p;
  }, []);
  // "İncele" diff'i hangi run için açacak: aktif run ya da geri yüklenen konuşmanın son run'ı.
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
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

  // Önizleme butonu: statik HTML VEYA React/Vite projesi algılanınca görünür.
  // (Tamamlanınca da yeniden sorgulanır → buton son anda oluşan girişi kaçırmaz.)
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const [previewInfo, setPreviewInfo] = useState<{ type: "vite" | "static" | "none"; entry?: string }>({ type: "none" });
  const previewRunId = activeRun?.id ?? reviewRunId;
  useEffect(() => {
    if (!previewRunId) {
      setPreviewAvailable(false);
      setPreviewInfo({ type: "none" });
      return;
    }
    let cancelled = false;
    fetch(`/api/preview/info/${previewRunId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { type?: "vite" | "static" | "none"; entry?: string } | null) => {
        if (cancelled) return;
        const type = data?.type ?? "none";
        setPreviewInfo({ type, entry: data?.entry });
        setPreviewAvailable(type !== "none");
      })
      .catch(() => {
        if (!cancelled) { setPreviewAvailable(false); setPreviewInfo({ type: "none" }); }
      });
    return () => {
      cancelled = true;
    };
  }, [previewRunId, workspaceFileEventCount, activeRun?.status]);

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
  const participantSources = useMemo(() => {
    return verifiedTools.map((tool) => ({
      cli: tool.id as DebateParticipant,
      label: displayToolName(tool.id),
      models: tool.modelOptions?.length ? tool.modelOptions : [{ id: "default", label: "default", limited: false }]
    }));
  }, [verifiedTools]);

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
  // "Çoklu Ajan" yalnızca SOHBET modunda var; kod moduna geçince multi → debate.
  useEffect(() => {
    if (activeView === "code" && mode === "multi") setMode("debate");
  }, [activeView, mode]);

  const selectedTool = useMemo(
    () => cliStatus?.tools.find((tool) => tool.id === singleCli),
    [cliStatus, singleCli]
  );
  const modelOptions: ModelOption[] = useMemo(() => {
    return mode !== "single"
      ? [{ id: "default", label: "default", limited: false }]
      : selectedTool?.modelOptions?.length
        ? selectedTool.modelOptions
        : [{ id: "default", label: "default", limited: false }];
  }, [mode, selectedTool]);

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

  // Aktif kod oturumu id'sini sakla → yenilemede aynı oturum geri açılır.
  useEffect(() => {
    if (codeConvoId) localStorage.setItem("orkestra.codeConvoId", codeConvoId);
  }, [codeConvoId]);

  useEffect(() => {
    void refresh();
    setChatConvos(loadConversations(CHAT_CONVERSATIONS_KEY));
    const code = loadConversations(CODE_CONVERSATIONS_KEY);
    setCodeConvos(code);
    // Sayfa yenilenince oturum kaybolmasın: kayıtlı kod oturumunu (yoksa aktif projenin
    // en güncelini) geri aç + son run'a yeniden bağlan.
    const savedConvoId = localStorage.getItem("orkestra.codeConvoId");
    const savedPid = localStorage.getItem("orkestra.activeProjectId");
    const sorted = [...code].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const restore =
      sorted.find((c) => c.id === savedConvoId && c.messages.some((m) => m.role === "user")) ??
      (savedPid ? sorted.find((c) => c.projectId === savedPid) : undefined);
    if (restore) {
      setCodeMessages(restore.messages.length ? restore.messages : [welcomeMessageFor(language)]);
      setCodeConvoId(restore.id);
      setCodingActive(Boolean(restore.codingActive));
      setReviewRunId(restore.lastRunId ?? null);
      if (restore.workspacePath) setProjectWorkspace(restore.workspacePath);
      if (restore.projectId) setActiveProjectId(restore.projectId);
      if (restore.lastRunId) void reconnectRun(restore.lastRunId);
    }
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
    phaseRunId?: string | null,
    lastRunId?: string | null
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
        phasePendingRunId: phaseRunId !== undefined ? phaseRunId : prev?.phasePendingRunId ?? null,
        // Son run id'si: oturuma dönünce ajan logları + İncele kartı bu run'dan geri yüklenir.
        lastRunId: lastRunId ?? prev?.lastRunId ?? null
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
    persistConvo(CODE_CONVERSATIONS_KEY, codeMessages, codeConvoId, setCodeConvos, projectWorkspace, activeProjectId, codingActive, phasePending, activeRun?.id ?? undefined);
  }, [codeMessages, codeConvoId, projectWorkspace, activeProjectId, codingActive, phasePending, activeRun?.id]);

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
    setStreamItems([]);
    setDiffOpen(false);
    setPhasePending(null);
    setCodeDebateDone(false);
    setLastAnalysis(null);
    // Projenin en güncel oturumunu aç; yoksa yeni boş oturum.
    const sessions = codeConvos.filter((c) => c.projectId === id);
    if (sessions.length) {
      const latest = sessions[0];
      setCodeMessages(latest.messages.length ? latest.messages : [welcomeMessageFor(language)]);
      setCodeConvoId(latest.id);
      setCodingActive(Boolean(latest.codingActive));
      setReviewRunId(latest.lastRunId ?? null);
      // Son run'a yeniden bağlan (çalışıyorsa canlı sürer, bekliyorsa "devam et" gelir).
      if (latest.lastRunId) void reconnectRun(latest.lastRunId);
    } else {
      setCodeMessages([welcomeMessageFor(language)]);
      setCodeConvoId(crypto.randomUUID());
      setCodingActive(false);
      setReviewRunId(null);
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

  // Mevcut bir PC klasörünü proje olarak aç (native klasör dialog'u) ve ona geç.
  async function openExistingProject() {
    try {
      const res = await api.post<{ workspacePath?: string; name?: string; cancelled?: boolean }>("/api/projects/open", {});
      if (res.cancelled || !res.workspacePath) return;
      const existing = projects.find((p) => p.workspacePath === res.workspacePath);
      if (existing) { switchProject(existing.id); return; }
      const proj: Project = { id: crypto.randomUUID(), name: res.name || "proje", workspacePath: res.workspacePath, createdAt: new Date().toISOString() };
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
      console.error("[Orkestra] Klasör açılamadı:", error);
    }
  }

  // GitHub deposunu klonla → proje olarak aç.
  async function cloneGithubProject() {
    const url = await askText({ title: text.githubCloneTitle, placeholder: text.githubCloneUrlPlaceholder, initial: "", confirmLabel: text.githubConnect });
    if (url === null || !url.trim()) return;
    try {
      const res = await api.post<{ workspacePath?: string; name?: string }>("/api/github/clone", { url: url.trim() });
      if (!res.workspacePath) return;
      const proj: Project = { id: crypto.randomUUID(), name: res.name || "repo", workspacePath: res.workspacePath, createdAt: new Date().toISOString() };
      setProjects((cur) => { const next = [proj, ...cur]; persistProjects(next); return next; });
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
      setNotice(text.githubClonedDone);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  // Projeyi yeni GitHub deposu olarak oluştur + push'la.
  async function pushProjectToGithub(id: string) {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    try {
      const st = await api.get<{ connected: boolean }>("/api/github/status");
      if (!st.connected) { setGithubToast({ ok: false, text: text.githubNotConnected }); return; }
    } catch {
      setGithubToast({ ok: false, text: text.githubNotConnected });
      return;
    }
    const fail = (e: unknown) => {
      let msg = e instanceof Error ? e.message : String(e);
      try { msg = (JSON.parse(msg) as { error?: string }).error || msg; } catch { /* düz metin */ }
      setGithubToast({ ok: false, text: msg });
    };
    // Proje zaten bir repoya bağlıysa (origin var) → tekrar sormadan direkt güncelle gönder.
    let linked: string | null = null;
    try {
      const remote = await api.post<{ repo: string | null }>("/api/github/remote", { workspacePath: proj.workspacePath });
      linked = remote.repo;
    } catch (error) { fail(error); return; }
    if (linked) {
      setGithubToast({ ok: true, text: `${text.githubPushUpdate}: ${linked}…` });
      try {
        await api.post("/api/github/push", { workspacePath: proj.workspacePath });
        setGithubToast({ ok: true, text: `${text.githubPushedTo} ${linked}` });
      } catch (error) { fail(error); }
      return;
    }
    // Bağlı değil → projeye geç + GitHub diyaloğunu aç (var olan repoya URL ile gönder VEYA yeni repo oluştur).
    if (activeProjectId !== id) switchProject(id);
    setGithubOpen(true);
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

  // Aktif run değiştikçe "İncele" hedef run'ını güncel tut.
  useEffect(() => {
    if (activeRun?.id) setReviewRunId(activeRun.id);
  }, [activeRun?.id]);

  // Diff'i sunucudan çek (working-tree, dosya başına unified diff).
  // Diff her zaman PROJE workspace'inin TÜM turlarının birikmiş farkını gösterir (run'a bağlı değil).
  // Önbellek: aynı (ws + değişiklik sayacı) için tekrar hesaplamaz → anında gösterir.
  const loadDiff = useCallback(async (force = false) => {
    const ws = activeRun?.workspacePath ?? projectWorkspace ?? null;
    if (!ws) { setDiffFiles([]); return; }
    const key = `${ws}@${workspaceFileEventCount}`;
    if (force) { diffCacheRef.current = null; diffInflightRef.current.delete(key); }
    else if (diffCacheRef.current?.key === key) { setDiffFiles(diffCacheRef.current.files); setDiffLoading(false); return; }
    setDiffLoading(true);
    try {
      setDiffFiles(await fetchDiff(ws, key));
    } catch {
      setDiffFiles([]);
    } finally {
      setDiffLoading(false);
    }
  }, [activeRun?.workspacePath, projectWorkspace, workspaceFileEventCount, fetchDiff]);

  // Değişiklik sayısını güncel tut (HIZLI uç — diff toplamaz). Proje/run/dosya-olayı değişince.
  // İş bitince (runActive false) tam diff'i ARKA PLANDA ön-yükle → İncele anında açılır.
  useEffect(() => {
    const ws = activeRun?.workspacePath ?? projectWorkspace ?? null;
    if (!ws) { setCumulativeChanges(0); return; }
    const running = activeRun?.status === "running" || activeRun?.status === "queued";
    let cancelled = false;
    void api.post<{ count: number }>("/api/git/changes", { workspacePath: ws })
      .then((res) => {
        if (cancelled) return;
        setCumulativeChanges(res.count ?? 0);
        // Aktif run yokken diff'i sıcak tut (kullanıcı İncele'ye basınca beklemesin).
        if (!running && (res.count ?? 0) > 0) {
          void fetchDiff(ws, `${ws}@${workspaceFileEventCount}`).catch(() => undefined);
        }
      })
      .catch(() => { if (!cancelled) setCumulativeChanges(0); });
    return () => { cancelled = true; };
  }, [activeRun?.workspacePath, activeRun?.status, projectWorkspace, workspaceFileEventCount, fetchDiff]);

  // "İncele" → sağdaki diff panelini aç (terminal açıksa kapanır).
  function openDiff() {
    setTerminalOpen(false);
    setDiffOpen(true);
    void loadDiff();
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
      setStreamItems([]);
      setEvents([]);
      setDiffOpen(false);
      setPhasePending(null);
      setReviewRunId(convo.lastRunId ?? null);
      // Son run'a yeniden bağlan: hâlâ çalışıyor/bekliyorsa CANLI sürer (SSE), bitmişse statik yüklenir.
      if (convo.lastRunId) {
        void reconnectRun(convo.lastRunId);
      }
    }
  }

  // Bir run'a yeniden bağlanır: çalışıyor/bekliyorsa setActiveRun ile SSE'yi yeniden kurar
  // (kodlama kaldığı yerden canlı sürer); bitmişse yalnızca event'leri statik yükler.
  // Bekleyen faz varsa "devam et" (phasePending) geri gelir.
  async function reconnectRun(runId: string) {
    try {
      const detail = await api.get<Run & { events: RunEvent[] }>(`/api/runs/${runId}`);
      const active = detail.status === "running" || detail.status === "queued";
      const awaiting =
        (detail.status === "running" && /awaiting/i.test(detail.activeStep ?? "")) ||
        (detail.status === "failed" && /Duraklat|⏸/i.test(detail.summary ?? ""));
      if (active || awaiting) {
        setActiveRun(detail); // SSE event'leri replay edip canlı akışı sürdürür
      } else {
        setEvents(detail.events ?? []); // bitmiş run: statik loglar + İncele kartı
      }
      if (awaiting) setPhasePending(detail.id);
    } catch {
      // run bulunamadıysa sessiz geç
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
        setDiffOpen(false);
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
      // Tazelik: SSE replay'inde (oturuma dönünce) eski event'ler için BİLDİRİM tetiklenmesin.
      const fresh = Date.now() - Date.parse(event.createdAt || "") < 15000;
      if (event.type === "phase_done") {
        // İçerik tekilleştirmesi: SSE replay'inde (oturuma dönünce) aynı faz raporu iki kez eklenmesin.
        setMessages((current) =>
          current.some((m) => m.content === event.message)
            ? current
            : [...current, { id: crypto.randomUUID(), role: "assistant", planner: "system", modelLabel: "Orkestra", content: event.message, createdAt: new Date().toISOString() }]
        );
        setPhasePending(event.runId);
        if (fresh) void showNotify({
          title: text.notifPhaseTitle,
          body: (event.message ?? "").replace(/\s+/g, " ").slice(0, 140),
          tag: `phase-${event.runId}`,
          data: { kind: "phase", view: "code", convoId: codeConvoIdRef.current, runId: event.runId },
          actions: [{ action: "phase-continue", title: text.phaseContinue }]
        });
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
        if (fresh && event.type === "completed") void showNotify({
          title: text.notifCodeDoneTitle,
          body: text.notifCodeDoneBody,
          tag: `run-${event.runId}`,
          data: { kind: "done", view: "code", convoId: codeConvoIdRef.current, runId: event.runId }
        });
        if (fresh && event.type === "failed" && !paused) void showNotify({
          title: text.notifErrorTitle,
          body: (event.message ?? "").replace(/\s+/g, " ").slice(0, 140),
          tag: `run-${event.runId}`,
          data: { kind: "error", view: "code", convoId: codeConvoIdRef.current, runId: event.runId }
        });
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

  async function streamDebate(message: string, history: ChatMessage[], signal?: AbortSignal) {
    const isCode = activeView === "code";
    const res = await fetch("/api/debate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
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
    if (language === "en") {
      return [
        "## Shared View",
        "Automatic operator analysis was unavailable; participant views are compiled below.",
        "## Unique Ideas",
        ...lines,
        "## Recommended Approach",
        `- Implement "${message}" by combining the common points of the views above.`
      ].join("\n");
    }
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
  async function fetchOperatorAnalysis(
    message: string,
    turns: { cli?: string; modelLabel?: string; content?: string }[],
    opts?: { operator?: { cli: DebateParticipant; model: string }; participants?: { cli: DebateParticipant; model: string }[]; convoId?: string }
  ) {
    const op = opts?.operator ?? operatorSel ?? participants[0];
    if (!op) return;
    const parts = opts?.participants ?? participants;
    // Bu analiz hangi oturuma ait? Async bittiğinde kullanıcı başka projeye geçmişse YAZMA (sızma önlenir).
    const ownerConvo = opts?.convoId ?? codeConvoIdRef.current;
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
          participants: parts.map((p) => ({ cli: p.cli, model: p.model === "default" ? undefined : p.model })),
          operator: { cli: op.cli, model: op.model === "default" ? undefined : op.model },
          effort: selectedEffort,
          language
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
    // Aksiyon kartı hazır (Ekip / Operatör) → bildir; bildirimden doğrudan yanıtlanabilir.
    void showNotify({
      title: text.notifActionTitle,
      body: text.notifActionBody,
      tag: `action-${codeConvoIdRef.current}`,
      data: { kind: "action", view: "code", convoId: codeConvoIdRef.current },
      actions: [
        { action: "team-start", title: text.notifActTeamStart },
        { action: "operator-build", title: text.notifActOperator }
      ]
    });
  }

  async function sendChat(overrideText?: string) {
    const content = (overrideText ?? chatInput).trim();
    const pending = attachments;
    if (!content && !pending.length) return;
    // Interrupt: AI düşünürken yeni prompt → mevcut isteği İPTAL ET, yeniye geç (queue yok).
    if (isThinking && chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    // Katman 2: açık "kodlamaya aktar" komutu → modele sormadan deterministik aktarım (yalnızca sohbette).
    if (activeView === "chat" && content && transferCommandIntent(content)) {
      setChatInput("");
      setAttachments([]);
      setIsThinking(false);
      void transferToCode();
      return;
    }
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
    const ac = new AbortController();
    chatAbortRef.current = ac;

    try {
      // Kodlama modu: mesaj TARTIŞMA değil, ajana TALİMAT → kaldığı yerden devam et.
      if (isCodeView && codingActive) {
        await continueCodingRun(messageToSend);
        return;
      }
      if (selectedPlanner === "debate") {
        await streamDebate(messageToSend, nextHistory, ac.signal);
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
        attachments: pending.map((item) => item.path),
        cache: summaryCacheRef.current.get(conversationId) // artımlı özet: backend tüm eskiyi yeniden özetlemesin
      }, ac.signal);
      // Dönen güncel özeti cache'le (sonraki istekte gönderilir → token tasarrufu).
      if (response.contextSummary !== undefined && typeof response.summaryUpto === "number") {
        summaryCacheRef.current.set(conversationId, { summary: response.contextSummary, upto: response.summaryUpto });
      }
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
      // Katman 3: otomatik "Proje algılandı" kartı — ama BELGE isteğinde gösterme (cv/pdf/word/şiir ≠ proje).
      {
        const di = docExportIntent(content);
        if (response.action === "suggest_pipeline" && !di.md && !di.txt && !di.word && !di.pdf && !di.excel) {
          setSuggestedPrompt(response.suggestedPrompt ?? content);
        }
      }
      // Sohbet modunda: model(ler) cevabını bitirdi → bildir (pencere odakta değilse).
      if (activeView === "chat" && !response.error) void showNotify({
        title: text.notifChatDoneTitle,
        body: (responseMessages[0]?.content ?? "").replace(/\s+/g, " ").slice(0, 140),
        tag: `chat-${conversationId}`,
        data: { kind: "chat-done", view: "chat", convoId: conversationId }
      });
      if (response.error) {
        // Sağ-alt baloncuk (toast) yok — hata zaten sohbette/stream'de görünüyor.
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
        void showNotify({
          title: text.notifErrorTitle,
          body: (response.error ?? "").replace(/\s+/g, " ").slice(0, 140),
          tag: `err-${conversationId}`,
          data: { kind: "error", view: activeView, convoId: conversationId }
        });
      }
    } catch (error) {
      // Kasıtlı iptal (stop/interrupt) → hata gösterme, yarım çıktıyı sessizce bırak.
      if ((error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && /aborted|abort/i.test(error.message))) {
        return;
      }
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
      void showNotify({
        title: text.notifErrorTitle,
        body: errorText.replace(/\s+/g, " ").slice(0, 140),
        tag: `err-${conversationId}`,
        data: { kind: "error", view: activeView, convoId: conversationId }
      });
    } finally {
      if (chatAbortRef.current === ac) chatAbortRef.current = null;
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
    ensureProject(run.workspacePath, deriveTitle(codeMessages));
    setEvents([]);
    setSuggestedPrompt(null);
    await refresh();
  }

  // Ekip planı üret (plancı projeyi alt-görevlere böler) ve düzenleme modalını aç.
  // autoStart=true → modalı atlayıp planı doğrudan başlat (bildirimden "Ekip: Başlat").
  async function createPlan(autoStart = false) {
    if (!autoStart) setPlanOpen(true);
    setPlanLoading(true);
    setPlanMeta(null);
    try {
      // Fazları İLGİLİ AJAN (operatör ya da ilk katılımcı) ANALİZ KARTINI dikkate alarak belirlesin.
      const lead = operatorSel ?? participants[0];
      const res = await api.post<{ tasks: PlanTask[]; planner: string; modelLabel: string }>("/api/plan", {
        history: messages,
        planner: lead?.cli ?? "auto",
        model: lead && lead.model !== "default" ? lead.model : undefined,
        analysis: lastAnalysis ?? undefined,
        agentCount: participants.length || undefined
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
      if (autoStart) {
        // Modalsız doğrudan başlat (bildirimden "Ekip: Başlat").
        const goal = goalFromConversation() || seeded.map((t) => t.title).join("; ");
        const run = await api.post<Run>("/api/runs", {
          prompt: goal,
          tasks: wireTeamDependencies(seeded),
          workspacePath: projectWorkspace ?? undefined
        });
        setActiveRun(run);
        setProjectWorkspace(run.workspacePath);
        ensureProject(run.workspacePath, deriveTitle(codeMessages));
        setEvents([]);
        setSuggestedPrompt(null);
        setCodeDebateDone(false);
        setCodingActive(true);
        await refresh();
      } else {
        setPlanTasks(seeded);
        setPlanMeta(res.modelLabel);
      }
    } catch (error) {
      setPlanTasks([]);
      console.error("[Orkestra] Plan üretilemedi:", error);
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
    ensureProject(run.workspacePath, deriveTitle(codeMessages));
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

  // En gelişmiş mevcut model (operatör varsayılanı için).
  function mostAdvancedAgent(): { cli: DebateParticipant; model: string } | null {
    let best: { cli: DebateParticipant; model: string } | null = null;
    let bestScore = -1;
    for (const s of participantSources) {
      for (const m of s.models) {
        if (m.limited || m.id === "default") continue;
        const score = modelRank(m.id, m.label);
        if (score > bestScore) { bestScore = score; best = { cli: s.cli, model: m.id }; }
      }
    }
    return best ?? firstAvailableAgents()[0] ?? null;
  }

  // Sohbetten code Tartışma'ya taşınacak katılımcılar: her doğrulanmış CLI'nin en iyi (isimli) modeli.
  function deriveParticipants(): { cli: DebateParticipant; model: string }[] {
    return participantSources
      .map((s) => {
        const named = s.models.filter((m) => m.id !== "default" && !m.limited);
        const best = named[0] ?? s.models.find((m) => !m.limited);
        return best ? { cli: s.cli, model: best.id } : null;
      })
      .filter((x): x is { cli: DebateParticipant; model: string } => Boolean(x));
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
    ensureProject(run.workspacePath, deriveTitle(codeMessages));
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
    const id = activeRun.id;
    // İyimser: UI'da anında durdur (backend yavaş/409 olsa bile kullanıcı takılı kalmasın).
    setActiveRun((cur) => (cur && cur.id === id ? { ...cur, status: "failed", activeStep: "stopped", completedAt: new Date().toISOString() } : cur));
    setPhasePending(null);
    try {
      await api.post(`/api/runs/${id}/stop`);
    } catch (error) {
      console.error("[Orkestra] Durdurma hatası:", error);
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
  // Sohbet → Code köprüsü (deterministik). Mod eşlemesi:
  //  Tek Ajan → Code Tek Ajan (brief → o ajan kodlar). Tartışma/Çoklu → Code Tartışma
  //  (katılımcılar taşınır, operatör = son seçili ya da en gelişmiş → operatör analizi + aksiyon kartı).
  async function transferToCode() {
    const userMsgs = messages.filter((m) => m.role === "user" && m.id !== "welcome" && m.content.trim());
    if (!userMsgs.length) {
      console.error("[Orkestra] Aktarmadan önce sohbette bir konu olmalı.");
      return;
    }
    const sourceMode = mode;
    const goal = goalFromConversation();
    const carried = messages.filter((m) => m.id !== "welcome");
    const newConvoId = crypto.randomUUID();

    // Code moduna geç + temiz oturum; sohbeti bağlam olarak taşı.
    setActiveView("code");
    setCodeConvoId(newConvoId);
    codeConvoIdRef.current = newConvoId;
    setActiveRun(null);
    setEvents([]);
    setStreamItems([]);
    setPhasePending(null);
    setLastAnalysis(null);
    setCodeMessages(carried);
    setSuggestedPrompt(null);

    if (sourceMode === "single") {
      setMode("single");
      setCodingActive(true);
      let brief = goal;
      try {
        const res = await api.post<{ brief: string }>("/api/brief", { history: carried, planner: singleCli });
        if (res.brief?.trim()) brief = res.brief.trim();
      } catch { /* fallback: goal */ }
      // Seçili tek ajanla doğrudan kodlamaya başla (1 görevlik run).
      const run = await api.post<Run>("/api/runs", {
        prompt: brief,
        tasks: [{ id: "task1", title: userMsgs[0].content.slice(0, 80) || "Görev", role: "builder", folder: "", dependsOn: [], cli: singleCli, model: selectedModel === "default" ? undefined : selectedModel }],
        workspacePath: projectWorkspace ?? undefined
      });
      setActiveRun(run);
      setProjectWorkspace(run.workspacePath);
      ensureProject(run.workspacePath, deriveTitle(carried));
      await refresh();
    } else {
      // Tartışma / Çoklu → Code Tartışma.
      setMode("debate");
      setCodingActive(false);
      const parts = participants.length ? participants : deriveParticipants();
      if (!participants.length) setParticipants(parts);
      const op = operatorSel ?? mostAdvancedAgent();
      if (op && !operatorSel) setOperatorSel(op);
      // Operatör analizi: chat turn'lerinden → analiz kartı + aksiyon kartı.
      const turns = carried
        .filter((m) => m.role === "assistant" && m.planner !== "system" && m.content.trim())
        .map((m) => ({ cli: undefined, modelLabel: m.modelLabel, content: m.content }));
      await fetchOperatorAnalysis(goal, turns, { operator: op ?? undefined, participants: parts, convoId: newConvoId });
    }
  }

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

  // Kurulumu pty'de (non-blocking) başlatır ve KURULANA kadar durumu sık yoklar → anlık "kuruldu".
  async function installCliAsync(tool: CliToolStatus): Promise<{ success: boolean; message: string }> {
    setNotice(null);
    try {
      const res = await api.post<{ message?: string }>(`/api/cli/${tool.id}/install`);
      if (res.message) setNotice(res.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(`${displayToolName(tool.id)}: ${message}`);
      return { success: false, message };
    }
    const deadline = Date.now() + 8 * 60_000; // agy uzun sürebilir
    return new Promise<{ success: boolean; message: string }>((resolve) => {
      const tick = async () => {
        const status = await api.get<CliStatusResponse>("/api/cli-status").catch(() => null);
        if (status) setCliStatus(status);
        const t = status?.tools.find((x) => x.id === tool.id);
        if (t?.installed) { setNotice(`${displayToolName(tool.id)}: kuruldu.`); resolve({ success: true, message: "kuruldu" }); return; }
        if (Date.now() > deadline) { setNotice(`${displayToolName(tool.id)}: kurulum zaman aşımı.`); resolve({ success: false, message: "timeout" }); return; }
        setTimeout(() => void tick(), 2500);
      };
      setTimeout(() => void tick(), 2500);
    });
  }

  // Login rehber dialog'unu açar (pencere kullanıcı isteyince açılır).
  async function loginCliAsync(tool: CliToolStatus): Promise<void> {
    setNotice(null);
    setLoginModal({ tool });
  }

  async function runCliAction(tool: CliToolStatus, action: "login" | "logout" | "test" | "install") {
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
      if ((action === "login" || action === "install") && typeof result === "object" && result && "message" in result) {
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
          className="iconButton"
          onClick={() => setSettingsOpen(true)}
          title={text.settings}
          style={{ width: "32px", height: "32px", padding: 0 }}
        >
          <Settings2 size={16} />
        </button>
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
        onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
        title={text.settings}
      >
        <Settings2 size={18} />
      </button>
    </div>
  );

  return (
    <main className="appShell">
      {!setupDone && (
        <SetupWizard
          language={language}
          theme={theme}
          status={cliStatus}
          onSetLanguage={setLanguage}
          onSetTheme={(t) => setTheme(t)}
          onAction={(tool, action) => void runCliAction(tool, action)}
          onInstall={installCliAsync}
          onLogin={loginCliAsync}
          onRefresh={() => void refresh()}
          onFinish={() => { localStorage.setItem("orkestra.setupDone", "1"); setSetupDone(true); }}
        />
      )}
      {setupDone && notifAskToday && (
        <div className="notifBanner">
          <Bell size={16} />
          <div className="notifBannerText">
            <strong>{text.notifEnableTitle}</strong>
            <span>{text.notifEnableDesc}</span>
          </div>
          <button className="primaryButton" onClick={() => void askNotificationPermission()}>{text.notifEnableBtn}</button>
          <button className="ghostButton" onClick={() => { localStorage.setItem("orkestra.notifAsked", new Date().toISOString().slice(0, 10)); setNotifAskToday(false); }}>{text.notifEnableLater}</button>
        </div>
      )}
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
                  onOpenGithub={() => setGithubOpen(true)}
                  onRemoveImage={removeImage}
                  conversations={conversations}
                  activeConversationId={conversationId}
                  onNewChat={newChat}
                  onOpenConversation={openConversation}
                  onDeleteConversation={deleteConversation}
                  onSend={(text) => void sendChat(text)}
                  onStop={stopThinking}
                  onClear={() => {
                    setMessages([welcomeMessageFor(language)]);
                    setSuggestedPrompt(null);
                    setAttachments([]);
                  }}
                  onCreateBrief={() => void createBrief()}
                  onTransferToCode={() => void transferToCode()}
                  onDismissPipeline={() => setSuggestedPrompt(null)}
                />
              </div>
            </section>
          </>
        ) : (
          <div
            className={`codeLayout${(terminalOpen || diffOpen) ? " termOpen" : ""}${sidebarCollapsed ? " sidebarCollapsed" : ""}${terminalResizing ? " resizing" : ""}`}
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
                label={projects.find((p) => p.id === activeProjectId)?.name}
              />
              <ProjectPanel
                language={language}
                projects={projects}
                sessions={codeConvos}
                activeProjectId={activeProjectId}
                activeSessionId={codeConvoId}
                onSwitch={switchProject}
                onCreate={() => void createProject()}
                onOpenExisting={() => void openExistingProject()}
                onCloneGithub={() => void cloneGithubProject()}
                onGithubPush={(id) => void pushProjectToGithub(id)}
                onRename={(id) => void renameProject(id)}
                onDelete={deleteProject}
                onNewSession={newSessionInProject}
                onOpenSession={openConversation}
                onDeleteSession={deleteConversation}
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
                  onStop={stopThinking}
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
                  onOpenGithub={() => setGithubOpen(true)}
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
                  onReview={openDiff}
                  cumulativeChanges={cumulativeChanges}
                  onTogglePreview={() => setShowPreview((current) => !current)}
                  previewOpen={showPreview}
                  previewAvailable={previewAvailable}
                />
              </div>
            </div>

            {diffOpen ? (
              <DiffPanel
                language={language}
                files={diffFiles}
                loading={diffLoading}
                width={terminalWidth}
                onWidthChange={setTerminalWidth}
                onResizeStart={() => setTerminalResizing(true)}
                onResizeEnd={() => setTerminalResizing(false)}
                onRefresh={() => void loadDiff(true)}
                onOpenFile={(path) => void openFileInDialog(path)}
                onGithubPush={activeProjectId ? () => { setGithubPushBusy(true); void pushProjectToGithub(activeProjectId).finally(() => setGithubPushBusy(false)); } : undefined}
                githubBusy={githubPushBusy}
                onClose={() => setDiffOpen(false)}
              />
            ) : (
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
                onToggle={() => { setDiffOpen(false); setTerminalOpen((value) => !value); }}
                onCreate={(shell) => void createTerminal(shell)}
                onClose={(id) => void closeTerminal(id)}
                onSelect={setActiveTerminalId}
                onInput={(id, value) => void sendTerminalInput(id, value)}
              />
            )}
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
          rootPath={activeRun?.workspacePath ?? projectWorkspace ?? null}
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

      {settingsOpen && (
        <SettingsDialog
          language={language}
          theme={theme}
          status={cliStatus}
          onSetLanguage={setLanguage}
          onSetTheme={(t) => setTheme(t)}
          onAction={(tool, action) => void runCliAction(tool, action)}
          onInstall={installCliAsync}
          onLogin={loginCliAsync}
          onRefresh={() => void refresh()}
          onClose={() => setSettingsOpen(false)}
          onResetWizard={() => { localStorage.removeItem("orkestra.setupDone"); setSetupDone(false); setSettingsOpen(false); }}
        />
      )}
      {githubOpen && (
        <GitHubDialog
          language={language}
          activeWorkspace={activeRun?.workspacePath ?? projectWorkspace ?? null}
          activeName={projects.find((p) => p.id === activeProjectId)?.name}
          onClose={() => setGithubOpen(false)}
          onCloned={(workspacePath, name) => {
            const existing = projects.find((p) => p.workspacePath === workspacePath);
            if (existing) { switchProject(existing.id); return; }
            const proj: Project = { id: crypto.randomUUID(), name, workspacePath, createdAt: new Date().toISOString() };
            setProjects((cur) => { const next = [proj, ...cur]; persistProjects(next); return next; });
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
            setGithubToast({ ok: true, text: text.githubClonedDone });
          }}
        />
      )}
      {githubToast && (
        <div className={`githubToast${githubToast.ok ? " ok" : " err"}`} onClick={() => setGithubToast(null)}>
          {githubToast.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{githubToast.text}</span>
        </div>
      )}
      {loginModal && (
        <LoginModal
          tool={loginModal.tool}
          language={language}
          onClose={() => setLoginModal(null)}
          onAuthenticated={() => void refresh()}
        />
      )}
      {/* Sağ-alt baloncuk (toast) kaldırıldı — UX'i bozuyordu. Mesajlar gerçek browser
          console'una yazılıyor (aşağıdaki effect); kullanıcıya kritik olanlar zaten chat'te. */}
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

// İlk açılış kurulum sihirbazı: dil/tema → paket kurulumu → giriş+test → yetkilendirme → bitti.
function SetupWizard({
  language, theme, status, onSetLanguage, onSetTheme, onAction, onInstall, onLogin, onRefresh, onFinish
}: {
  language: Language;
  theme: "light" | "dark";
  status: CliStatusResponse | null;
  onSetLanguage: (l: Language) => void;
  onSetTheme: (t: "light" | "dark") => void;
  onAction: (tool: CliToolStatus, action: "login" | "logout" | "test" | "install") => void;
  onInstall: (tool: CliToolStatus) => Promise<{ success: boolean; message: string }>;
  onLogin: (tool: CliToolStatus) => Promise<void>;
  onRefresh: () => void;
  onFinish: () => void;
}) {
  const text = uiText[language];
  const [step, setStep] = useState(0);
  const [authorized, setAuthorized] = useState(false);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [loggingIn, setLoggingIn] = useState<Set<string>>(new Set());
  const [installWarn, setInstallWarn] = useState(false);
  const [nPerm, setNPerm] = useState<NotificationPermission>(notificationPermission());
  const enableNotifications = async () => {
    localStorage.setItem("orkestra.notifAsked", new Date().toISOString().slice(0, 10));
    setNPerm(await requestNotificationPermission());
  };
  const login = async (tool: CliToolStatus) => {
    setLoggingIn((s) => new Set(s).add(tool.id));
    await onLogin(tool);
    setLoggingIn((s) => { const n = new Set(s); n.delete(tool.id); return n; });
  };
  const tools = status?.tools ?? [];
  const anyReady = tools.some((t) => t.installed && t.authenticated);
  const notInstalled = tools.filter((t) => !t.installed);
  const steps = [text.stepLangTheme, text.stepInstall, text.stepAuth, text.stepAuthorize, text.stepDone];

  const install = async (tool: CliToolStatus) => {
    setInstalling((s) => new Set(s).add(tool.id));
    setInstallWarn(false);
    await onInstall(tool);
    setInstalling((s) => { const n = new Set(s); n.delete(tool.id); return n; });
  };
  // PARALEL kur: claude/codex 5sn'de biter, agy (uzun indirme) arkada devam eder.
  const installAll = async () => {
    await Promise.all(tools.filter((x) => !x.installed).map((t) => install(t)));
  };
  // İleri (kurulum adımı): EN AZ BİR CLI kurulu yeterli. Hiçbiri kurulu değilse engelle;
  // en az biri kuruluysa (agy hâlâ kuruluyor olsa bile) geç.
  const installedCount = tools.filter((t) => t.installed).length;
  const nextFromInstall = () => {
    if (installedCount === 0) { setInstallWarn(true); return; }
    setStep((s) => s + 1);
  };

  const StatusBadge = ({ ok, okLabel, noLabel }: { ok: boolean; okLabel: string; noLabel: string }) => (
    <span className={`wizardBadge ${ok ? "ok" : "no"}`}>
      {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {ok ? okLabel : noLabel}
    </span>
  );

  return (
    <div className="wizardOverlay">
      <div className="wizardCard">
        <div className="wizardHeader">
          <img src="/logo.png" alt="Orkestra" className="wizardLogo" />
          <div className="wizardHeaderText">
            <strong>{text.setupTitle}</strong>
            <span>{steps[step]}</span>
          </div>
        </div>
        <div className="wizardSteps">
          {steps.map((_, i) => (
            <span key={i} className={`wizardDot${i === step ? " on" : ""}${i < step ? " done" : ""}`} />
          ))}
        </div>

        <div className="wizardBody">
          {step === 0 && (
            <div className="wizardPane">
              <p className="wizardLead">{text.setupWelcome}</p>
              <div className="wizardField">
                <label>{text.language}</label>
                <div className="languageSwitch">
                  <button className={language === "en" ? "active" : ""} onClick={() => onSetLanguage("en")}>EN</button>
                  <button className={language === "tr" ? "active" : ""} onClick={() => onSetLanguage("tr")}>TR</button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="wizardPane">
              <p className="wizardLead">{text.installLead}</p>
              {tools.map((t) => {
                const busy = installing.has(t.id);
                return (
                  <div className="wizardCliRow" key={t.id}>
                    <div className="wizardCliName">
                      <span className={`agentIcon ${t.id}`}>{iconForTool(t.id)}</span>
                      <strong>{displayToolName(t.id)}</strong>
                    </div>
                    {busy ? (
                      <span className="wizardBadge installing"><span className="liveSpinner" /> {text.installingNow}</span>
                    ) : (
                      <StatusBadge ok={t.installed} okLabel={text.installed} noLabel={text.notInstalled} />
                    )}
                    <button className="ghostButton" disabled={busy} onClick={() => void install(t)}>
                      <Play size={13} /> {t.installed ? text.reinstall : text.install}
                    </button>
                  </div>
                );
              })}
              {installWarn && installedCount === 0 && (
                <p className="wizardWarn">
                  <AlertTriangle size={14} /> {text.installNeedOne}
                </p>
              )}
              <p className="wizardHint">{text.installHintHeadless}</p>
            </div>
          )}

          {step === 2 && (
            <div className="wizardPane">
              <p className="wizardLead">{text.authLead}</p>
              {tools.map((t) => {
                const waiting = loggingIn.has(t.id);
                return (
                  <div className="wizardCliRow" key={t.id}>
                    <div className="wizardCliName">
                      <span className={`agentIcon ${t.id}`}>{iconForTool(t.id)}</span>
                      <strong>{displayToolName(t.id)}</strong>
                    </div>
                    {waiting ? (
                      <span className="wizardBadge installing"><span className="liveSpinner" /> {text.waitingLogin}</span>
                    ) : (
                      <StatusBadge ok={t.authenticated} okLabel={text.authorizedOk} noLabel={text.notAuthorized} />
                    )}
                    <div className="wizardCliActions">
                      <button className="ghostButton" disabled={!t.installed || waiting} onClick={() => void login(t)}><LogIn size={13} /> {text.login}</button>
                      <button className="ghostButton" disabled={!t.installed || waiting} onClick={() => onAction(t, "test")}>{text.test}</button>
                    </div>
                  </div>
                );
              })}
              <p className="wizardHint">{text.authHintLive}</p>
            </div>
          )}

          {step === 3 && (
            <div className="wizardPane">
              <p className="wizardLead">{text.authorizeTitle}</p>
              <p className="wizardDesc">{text.authorizeDesc}</p>
              <ul className="wizardAuthList">
                <li><CheckCircle2 size={14} /> {text.authorizeItem1}</li>
                <li><CheckCircle2 size={14} /> {text.authorizeItem2}</li>
                <li><CheckCircle2 size={14} /> {text.authorizeItem3}</li>
              </ul>
              <label className="wizardCheck">
                <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
                {text.authorizeConfirm}
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="wizardPane wizardDonePane">
              <CheckCircle2 size={42} className="wizardDoneIcon" />
              <p className="wizardLead">{text.setupDoneTitle}</p>
              <div className="wizardSummary">
                {tools.map((t) => (
                  <div className="wizardCliRow" key={t.id}>
                    <div className="wizardCliName">
                      <span className={`agentIcon ${t.id}`}>{iconForTool(t.id)}</span>
                      <strong>{displayToolName(t.id)}</strong>
                    </div>
                    <StatusBadge ok={t.installed && t.authenticated} okLabel={text.ready} noLabel={text.notReady} />
                  </div>
                ))}
              </div>
              {!anyReady && <p className="wizardWarn"><AlertTriangle size={14} /> {text.needOneCli}</p>}
              {notificationsSupported && (
                <div className="wizardNotifRow">
                  <Bell size={18} />
                  <div className="wizardNotifText">
                    <strong>{text.notifEnableTitle}</strong>
                    <span>{text.notifEnableDesc}</span>
                  </div>
                  {nPerm === "granted" ? (
                    <span className="wizardBadge ok"><CheckCircle2 size={13} /> {text.ready}</span>
                  ) : nPerm === "denied" ? (
                    <span className="wizardBadge no"><AlertTriangle size={13} /> {text.notReady}</span>
                  ) : (
                    <button className="primaryButton" onClick={() => void enableNotifications()}>{text.notifEnableBtn}</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="wizardFooter">
          {step > 0 ? <button className="ghostButton" onClick={() => setStep((s) => s - 1)}>{text.back}</button> : <span />}
          <button className="ghostButton wizardRefresh" onClick={onRefresh}><RefreshCw size={13} /> {text.refresh}</button>
          {step < 4 ? (
            <button className="primaryButton" disabled={step === 3 && !authorized} onClick={() => (step === 1 ? nextFromInstall() : setStep((s) => s + 1))}>{text.next}</button>
          ) : (
            <button className="primaryButton" disabled={!anyReady} onClick={onFinish}>{text.startApp}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Composer "+" menüsü: Fotoğraf/dosya yükle + GitHub. (Sohbet ve kod modunda ortak.)
function AttachMenu({ language, onPickFile, onOpenGithub }: { language: Language; onPickFile: () => void; onOpenGithub?: () => void }) {
  const text = uiText[language];
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="attachWrap" onMouseDown={(e) => e.stopPropagation()}>
      <button className="iconRound" onClick={() => setOpen((o) => !o)} title={text.addImage}><Plus size={16} /></button>
      {open && (
        <div className="rowMenu attachMenu">
          <button onClick={() => { setOpen(false); onPickFile(); }}><FileIcon size={13} /> {text.attachMenuFile}</button>
          {onOpenGithub && (
            <button onClick={() => { setOpen(false); onOpenGithub(); }}><Github size={13} /> {text.githubMenuItem}</button>
          )}
        </div>
      )}
    </div>
  );
}

// GitHub diyaloğu (composer "+" menüsünden açılır): Device Flow ("Bağlan → tarayıcıda onayla")
// öncelikli; bağlıyken bu projeyi gönder + repo klonla. PAT yapıştırma gelişmiş yedek.
type GitHubState = { connected: boolean; login?: string; name?: string | null; error?: string };
type DeviceInfo = { deviceCode: string; userCode: string; verificationUri: string; interval: number };
function GitHubDialog({
  language,
  activeWorkspace,
  activeName,
  onClose,
  onCloned
}: {
  language: Language;
  activeWorkspace?: string | null;
  activeName?: string;
  onClose: () => void;
  onCloned?: (workspacePath: string, name: string) => void;
}) {
  const text = uiText[language];
  const [state, setState] = useState<GitHubState | null>(null);
  const [clientId, setClientId] = useState<string | null>(null); // null = henüz bilinmiyor
  const [cidInput, setCidInput] = useState("");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [usePat, setUsePat] = useState(false);
  const [token, setToken] = useState("");
  const pollRef = useRef<number | null>(null);
  // Bağlıyken: bu projeyi gönder + repo klonla.
  const [repoName, setRepoName] = useState(activeName || "");
  const [priv, setPriv] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [pushUrl, setPushUrl] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneBusy, setCloneBusy] = useState(false);
  // Projenin bağlı olduğu repo (origin). Varsa tekrar sormadan tek-tık güncelle gösterilir.
  const [linkedRepo, setLinkedRepo] = useState<string | null>(null);
  const [changeRepo, setChangeRepo] = useState(false);
  const refreshLinked = async () => {
    if (!activeWorkspace) { setLinkedRepo(null); return; }
    try {
      const r = await api.post<{ repo: string | null }>("/api/github/remote", { workspacePath: activeWorkspace });
      setLinkedRepo(r.repo);
    } catch { setLinkedRepo(null); }
  };
  useEffect(() => { if (state?.connected) void refreshLinked(); }, [state?.connected, activeWorkspace]);

  const loadStatus = async () => {
    try { setState(await api.get<GitHubState>("/api/github/status")); } catch { setState({ connected: false }); }
  };
  const loadClientId = async () => {
    try { setClientId((await api.get<{ clientId: string }>("/api/github/clientid")).clientId || ""); } catch { setClientId(""); }
  };
  useEffect(() => { void loadStatus(); void loadClientId(); }, []);
  // Poll interval'ini temizle.
  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);
  const stopPolling = () => { if (pollRef.current) { window.clearTimeout(pollRef.current); pollRef.current = null; } };

  const errMsg = (e: unknown, fallback?: string) => {
    let msg = e instanceof Error ? e.message : String(e);
    try { msg = (JSON.parse(msg) as { error?: string }).error || msg; } catch { /* düz metin */ }
    return msg || fallback || "";
  };

  const saveClientId = async () => {
    if (!cidInput.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ clientId: string }>("/api/github/clientid", { clientId: cidInput.trim() });
      setClientId(r.clientId);
      setCidInput("");
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  // Device Flow: kod al → tarayıcıyı aç → onaylanana kadar yokla.
  const startDevice = async () => {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const d = await api.post<DeviceInfo>("/api/github/device/start", {});
      setDevice(d);
      // Kullanışlılık: kodu panoya kopyala + onay sayfasını aç.
      try { await navigator.clipboard.writeText(d.userCode); setInfo(text.githubCodeCopied); } catch { /* yoksay */ }
      window.open(d.verificationUri, "_blank", "noopener");
      stopPolling();
      // Kendi kendini zamanlayan yoklama: slow_down gelirse aralığı +5sn artır (yoksa GitHub
      // token yerine sürekli slow_down döndürür ve onay hiç görünmez). Başlangıçta tampon +1sn.
      let delay = (Math.max(5, d.interval) + 1) * 1000;
      const schedule = () => { pollRef.current = window.setTimeout(() => void tick(), delay); };
      const tick = async () => {
        try {
          const r = await api.post<GitHubState & { pending?: boolean; slowDown?: boolean; error?: string }>("/api/github/device/poll", { deviceCode: d.deviceCode });
          if (r.connected) { stopPolling(); setDevice(null); setInfo(null); setState(r); return; }
          if (r.error) { stopPolling(); setDevice(null); setErr(r.error); return; }
          if (r.slowDown) delay += 5000;
          schedule();
        } catch (e) { stopPolling(); setDevice(null); setErr(errMsg(e)); }
      };
      schedule();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setBusy(false); }
  };

  const connectPat = async () => {
    if (!token.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.post<GitHubState>("/api/github/connect", { token: token.trim() });
      setState(res); setToken("");
    } catch (e) { setErr(errMsg(e, text.githubInvalidToken)); } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await api.post("/api/github/disconnect", {}); setState({ connected: false }); setPushResult(null); } finally { setBusy(false); }
  };

  // Bu projeyi yeni GitHub deposu olarak oluştur + push.
  const push = async () => {
    if (!activeWorkspace || !repoName.trim()) return;
    setPushBusy(true); setErr(null); setPushResult(null);
    try {
      const r = await api.post<{ htmlUrl: string; fullName: string }>("/api/github/repo", { workspacePath: activeWorkspace, name: repoName.trim(), private: priv });
      setPushResult(r.fullName);
      setChangeRepo(false);
      void refreshLinked();
    } catch (e) { setErr(errMsg(e)); } finally { setPushBusy(false); }
  };

  // Var olan bir repoya (URL) gönder — "link ver → push et" deterministik akışı.
  const pushToExisting = async () => {
    if (!activeWorkspace || !pushUrl.trim()) return;
    setPushBusy(true); setErr(null); setPushResult(null);
    try {
      const r = await api.post<{ ok: boolean; repo?: string }>("/api/github/push", { workspacePath: activeWorkspace, remoteUrl: pushUrl.trim() });
      setPushResult(r.repo || pushUrl.trim());
      setPushUrl("");
      setChangeRepo(false);
      void refreshLinked();
    } catch (e) { setErr(errMsg(e)); } finally { setPushBusy(false); }
  };

  // Zaten bağlı repoya tek-tık güncelleme push'u (URL/ad sormadan).
  const pushUpdate = async () => {
    if (!activeWorkspace) return;
    setPushBusy(true); setErr(null); setPushResult(null);
    try {
      await api.post<{ ok: boolean }>("/api/github/push", { workspacePath: activeWorkspace });
      setPushResult(linkedRepo || "");
    } catch (e) { setErr(errMsg(e)); } finally { setPushBusy(false); }
  };

  // GitHub deposunu klonla → proje olarak ekle (parent).
  const doClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloneBusy(true); setErr(null);
    try {
      const r = await api.post<{ workspacePath?: string; name?: string }>("/api/github/clone", { url: cloneUrl.trim() });
      if (r.workspacePath) { onCloned?.(r.workspacePath, r.name || "repo"); onClose(); }
    } catch (e) { setErr(errMsg(e)); } finally { setCloneBusy(false); }
  };

  const body = (
    <>
      {state?.connected ? (
        <>
          <div className="githubConnectedRow">
            <span className="wizardBadge ok"><CheckCircle2 size={13} /> {text.githubConnectedAs} <strong>{state.login}</strong></span>
            <button className="ghostButton danger" disabled={busy} onClick={() => void disconnect()}>
              <LogOut size={13} /> {text.githubDisconnect}
            </button>
          </div>
          {activeWorkspace ? (
            linkedRepo && !changeRepo ? (
              // Proje zaten bir repoya bağlı → tekrar sormadan tek-tık güncelle.
              <div className="githubActionBlock">
                <p className="githubHint"><strong><Github size={13} /> {text.githubLinkedRepo}:</strong> <strong>{linkedRepo}</strong></p>
                <div className="githubConnectForm">
                  <button className="ghostButton" disabled={pushBusy} onClick={() => void pushUpdate()}>
                    <UploadCloud size={14} /> {pushBusy ? text.githubConnecting : text.githubPushUpdate}
                  </button>
                  <button className="githubLinkBtn" onClick={() => { setChangeRepo(true); setErr(null); }}>{text.githubChangeRepo}</button>
                </div>
                {pushResult && <p className="githubHint">{text.githubPushedTo} <strong>{pushResult || linkedRepo}</strong></p>}
              </div>
            ) : (
              <>
                <div className="githubActionBlock">
                  <p className="githubHint"><strong><UploadCloud size={13} /> {text.githubPushExisting}</strong></p>
                  <div className="githubConnectForm">
                    <input className="githubTokenInput" placeholder={text.githubRepoUrlPlaceholder} value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void pushToExisting(); }} />
                    <button className="ghostButton" disabled={pushBusy || !pushUrl.trim()} onClick={() => void pushToExisting()}>
                      <UploadCloud size={14} /> {pushBusy ? text.githubConnecting : text.githubPush}
                    </button>
                    <p className="githubHint">{text.githubPushExistingHint}</p>
                  </div>
                </div>
                <div className="githubActionBlock">
                  <p className="githubHint"><strong><Github size={13} /> {text.githubCreateNew}</strong></p>
                  <div className="githubConnectForm">
                    <input className="githubTokenInput" placeholder={text.githubRepoNamePrompt} value={repoName} onChange={(e) => setRepoName(e.target.value)} />
                    <label className="githubCheck"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> {text.githubRepoPrivatePrompt}</label>
                    <button className="ghostButton" disabled={pushBusy || !repoName.trim()} onClick={() => void push()}>
                      <UploadCloud size={14} /> {pushBusy ? text.githubConnecting : text.githubPush}
                    </button>
                  </div>
                </div>
                {linkedRepo && <button className="githubLinkBtn" onClick={() => { setChangeRepo(false); setErr(null); }}>← {text.githubLinkedRepo}: {linkedRepo}</button>}
                {pushResult && <p className="githubHint">{text.githubPushedTo} <strong>{pushResult}</strong></p>}
              </>
            )
          ) : (
            <div className="githubActionBlock"><p className="githubHint">{text.githubNoActiveProject}</p></div>
          )}
          <div className="githubActionBlock">
            <p className="githubHint"><strong><Github size={13} /> {text.githubCloneTitle}</strong></p>
            <div className="githubConnectForm">
              <input className="githubTokenInput" placeholder={text.githubCloneUrlPlaceholder} value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} />
              <button className="ghostButton" disabled={cloneBusy || !cloneUrl.trim()} onClick={() => void doClone()}>
                <Github size={14} /> {cloneBusy ? text.githubConnecting : text.githubCloneTitle}
              </button>
            </div>
          </div>
          {err && <p className="githubError">{err}</p>}
        </>
      ) : device ? (
        // Device Flow aktif: kodu göster + tarayıcıyı tekrar açma + onay bekle.
        <div className="githubDeviceBox">
          <p className="githubHint">{text.githubDevicePrompt}</p>
          <div className="githubUserCode">{device.userCode}</div>
          <div className="githubConnectForm">
            <button className="ghostButton" onClick={() => window.open(device.verificationUri, "_blank", "noopener")}>
              <ExternalLink size={13} /> {text.githubOpenBrowser}
            </button>
            <span className="githubWaiting"><span className="liveSpinner" /> {text.githubWaiting}</span>
          </div>
          {info && <p className="githubHint">{info}</p>}
          {err && <p className="githubError">{err}</p>}
        </div>
      ) : usePat ? (
        // Gelişmiş: token ile bağlan (yedek).
        <div className="githubConnectForm">
          <input
            type="password"
            className="githubTokenInput"
            placeholder={text.githubTokenPlaceholder}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void connectPat(); }}
          />
          <button className="ghostButton" disabled={busy || !token.trim()} onClick={() => void connectPat()}>
            {busy ? text.githubConnecting : text.githubConnect}
          </button>
          <p className="githubHint">{text.githubTokenHint}</p>
          <button className="githubLinkBtn" onClick={() => { setUsePat(false); setErr(null); }}>{text.githubBackToDevice}</button>
          {err && <p className="githubError">{err}</p>}
        </div>
      ) : clientId ? (
        // Client ID hazır → tek tık bağlan.
        <div className="githubConnectForm">
          <button className="primaryButton" disabled={busy} onClick={() => void startDevice()}>
            <Github size={14} /> {busy ? text.githubConnecting : text.githubConnectWith}
          </button>
          <button className="githubLinkBtn" onClick={() => { setUsePat(true); setErr(null); }}>{text.githubAdvancedToken}</button>
          {err && <p className="githubError">{err}</p>}
        </div>
      ) : clientId === "" ? (
        // Tek seferlik kurulum: Client ID gir.
        <div className="githubConnectForm">
          <p className="githubHint"><strong>{text.githubClientIdSetup}</strong></p>
          <input
            className="githubTokenInput"
            placeholder={text.githubClientIdPlaceholder}
            value={cidInput}
            onChange={(e) => setCidInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveClientId(); }}
          />
          <button className="ghostButton" disabled={busy || !cidInput.trim()} onClick={() => void saveClientId()}>{text.githubSave}</button>
          <p className="githubHint">{text.githubCreateAppHint}</p>
          <button className="githubLinkBtn" onClick={() => window.open("https://github.com/settings/applications/new", "_blank", "noopener")}>
            <ExternalLink size={12} /> {text.githubCreateAppLink}
          </button>
          <button className="githubLinkBtn" onClick={() => { setUsePat(true); setErr(null); }}>{text.githubAdvancedToken}</button>
          {err && <p className="githubError">{err}</p>}
        </div>
      ) : (
        <p className="githubHint">…</p>
      )}
    </>
  );

  return (
    <div className="settingsOverlay" onMouseDown={onClose}>
      <div className="settingsDialog glassPanel githubModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settingsHeader">
          <div className="panelTitle"><Github size={18} /><span>{text.githubSection}</span></div>
          <button className="iconButton" onClick={onClose} title={text.close}><X size={16} /></button>
        </div>
        <div className="settingsBody">{body}</div>
      </div>
    </div>
  );
}

// Ayarlar dialog'u: tercih değişikliği + CLI yönetimi + sihirbazı sıfırla.
function SettingsDialog({
  language, theme, status, onSetLanguage, onSetTheme, onAction, onInstall, onLogin, onRefresh, onClose, onResetWizard
}: {
  language: Language;
  theme: "light" | "dark";
  status: CliStatusResponse | null;
  onSetLanguage: (l: Language) => void;
  onSetTheme: (t: "light" | "dark") => void;
  onAction: (tool: CliToolStatus, action: "login" | "logout" | "test" | "install") => void;
  onInstall: (tool: CliToolStatus) => Promise<{ success: boolean; message: string }>;
  onLogin: (tool: CliToolStatus) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
  onResetWizard: () => void;
}) {
  const text = uiText[language];
  const tools = status?.tools ?? [];
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [loggingIn, setLoggingIn] = useState<Set<string>>(new Set());
  const install = async (tool: CliToolStatus) => {
    setInstalling((s) => new Set(s).add(tool.id));
    await onInstall(tool);
    setInstalling((s) => { const n = new Set(s); n.delete(tool.id); return n; });
  };
  const login = async (tool: CliToolStatus) => {
    setLoggingIn((s) => new Set(s).add(tool.id));
    await onLogin(tool);
    setLoggingIn((s) => { const n = new Set(s); n.delete(tool.id); return n; });
  };
  return (
    <div className="settingsOverlay" onMouseDown={onClose}>
      <div className="settingsDialog glassPanel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settingsHeader">
          <div className="panelTitle"><Settings2 size={18} /><span>{text.settings}</span></div>
          <button className="iconButton" onClick={onClose} title={text.close}><X size={16} /></button>
        </div>
        <div className="settingsBody">
          <div className="settingsRow">
            <label>{text.language}</label>
            <div className="languageSwitch">
              <button className={language === "en" ? "active" : ""} onClick={() => onSetLanguage("en")}>EN</button>
              <button className={language === "tr" ? "active" : ""} onClick={() => onSetLanguage("tr")}>TR</button>
            </div>
          </div>

          <div className="settingsSection">
            <div className="settingsSectionHead">
              <span>{text.cliSection}</span>
              <button className="iconButton" onClick={onRefresh} title={text.refresh}><RefreshCw size={14} /></button>
            </div>
            {tools.map((t) => (
              <div className="wizardCliRow" key={t.id}>
                <div className="wizardCliName">
                  <span className={`agentIcon ${t.id}`}>{iconForTool(t.id)}</span>
                  <strong>{displayToolName(t.id)}</strong>
                </div>
                {installing.has(t.id) ? (
                  <span className="wizardBadge installing"><span className="liveSpinner" /> {text.installingNow}</span>
                ) : loggingIn.has(t.id) ? (
                  <span className="wizardBadge installing"><span className="liveSpinner" /> {text.waitingLogin}</span>
                ) : (
                  <span className={`wizardBadge ${t.installed && t.authenticated ? "ok" : "no"}`}>
                    {t.installed && t.authenticated ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {t.installed ? (t.authenticated ? text.ready : text.notAuthorized) : text.notInstalled}
                  </span>
                )}
                <div className="wizardCliActions">
                  {!t.installed && <button className="ghostButton" disabled={installing.has(t.id)} onClick={() => void install(t)}>{text.install}</button>}
                  {t.installed && !t.authenticated && <button className="ghostButton" disabled={loggingIn.has(t.id)} onClick={() => void login(t)}><LogIn size={13} /> {text.login}</button>}
                  {t.installed && <button className="ghostButton" onClick={() => onAction(t, "test")}>{text.test}</button>}
                  {t.installed && t.authenticated && <button className="ghostButton danger" onClick={() => onAction(t, "logout")}><LogOut size={13} /> {text.logout}</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="settingsSection">
            <div className="settingsSectionHead">
              <span>{text.limitsTitle}</span>
              <button className="iconButton" onClick={onRefresh} title={text.refresh}><RefreshCw size={14} /></button>
            </div>
            {tools.filter((t) => t.installed).length === 0 ? (
              <p className="limitPopupEmpty">{text.readingCli}</p>
            ) : (
              tools.filter((t) => t.installed).map((t) => (
                <div className="limitPopupRow" key={t.id}>
                  <div className="limitPopupName">
                    <span className={`agentIcon ${t.id}`}>{iconForTool(t.id)}</span>
                    <strong>{displayToolName(t.id)}</strong>
                  </div>
                  {t.usage?.windows?.length ? (
                    t.usage.windows.map((w) => (
                      <div className="limitMini" key={w.label}>
                        <div className="limitMiniHead"><span>{w.label}</span><span>%{w.usedPercent}</span></div>
                        <div className="limitMiniTrack">
                          <div
                            className={`limitMiniFill${w.usedPercent >= 90 ? " danger" : w.usedPercent >= 60 ? " warn" : ""}`}
                            style={{ width: `${w.usedPercent}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="limitNoData">{text.limitNoCliData}</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="settingsDanger">
            <div>
              <strong>{text.resetSetup}</strong>
              <p>{text.resetSetupDesc}</p>
            </div>
            <button className="ghostButton danger" onClick={onResetWizard}><RotateCcw size={14} /> {text.resetSetup}</button>
          </div>
        </div>
      </div>
    </div>
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
  onOpenGithub,
  onRemoveImage,
  conversations,
  activeConversationId,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
  onSend,
  onStop,
  onClear,
  onCreateBrief,
  onTransferToCode,
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
  onOpenGithub?: () => void;
  onRemoveImage: (path: string) => void;
  conversations: StoredConversation[];
  activeConversationId: string;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSend: (text?: string) => void;
  onStop?: () => void;
  onClear: () => void;
  onCreateBrief: () => void;
  onTransferToCode?: () => void;
  onDismissPipeline: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
    // Stick-to-bottom: yalnızca kullanıcı zaten en alttaysa (son ~120px) otomatik kaydır;
    // geçmişi okumak için yukarı kaydırdıysa yerinde bırak.
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, suggestedPrompt]);

  return (
    <section className="chatPanel glassPanel">

      <div className="chatMessages" ref={scrollRef}>
        {messages.map((message, i) => {
          // Bu asistan cevabı bir belge isteğine mi yanıt? → öne çıkan indir bar'ı göster.
          const prevUser = message.role === "assistant"
            ? [...messages.slice(0, i)].reverse().find((m) => m.role === "user")
            : undefined;
          const intent = prevUser ? docExportIntent(prevUser.content) : { md: false, txt: false, word: false, pdf: false, excel: false };
          const showArtifact = message.role === "assistant" && message.content.trim().length > 40 && (intent.md || intent.txt || intent.word || intent.pdf || intent.excel);
          return (
          <article key={message.id ?? `${message.role}-${message.createdAt}`} className={`chatBubble ${message.role} compact`}>
            {message.role === "assistant" && (
              <div className="messageMeta">
                <Bot size={14} />
                <span>{message.modelLabel ?? "Orkestra"}</span>
              </div>
            )}
            {showArtifact
              ? <DocArtifact content={message.content} intent={intent} language={language} />
              : <pre>{message.content}</pre>}
            <div className="bubbleFooter">
              {message.createdAt && <time>{new Date(message.createdAt).toLocaleTimeString("tr-TR")}</time>}
              <CopyButton value={message.content} label={text.copyMessage} copiedLabel={text.copied} />
            </div>
          </article>
          );
        })}
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
        <div className="composerTopRow">
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
          {onTransferToCode && messages.some((m) => m.role === "user" && m.id !== "welcome") && (
            <button className="transferToCodeBtn" onClick={onTransferToCode} title={text.transferToCodeTitle}>
              <Code size={14} /> {text.transferToCode}
            </button>
          )}
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
                <AttachMenu language={language} onPickFile={() => fileInputRef.current?.click()} onOpenGithub={onOpenGithub} />
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
                {thinking ? (
                  <button className="iconRound sendCircle stopCircle" onClick={() => onStop?.()} title={text.stop}>
                    <Square size={15} />
                  </button>
                ) : (
                  <button
                    className="iconRound sendCircle"
                    disabled={(!value.trim() && !attachments.length) || !cliOptions.length}
                    onClick={() => onSend()}
                    title={text.send}
                  >
                    <ArrowUp size={18} />
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
  onOpenExisting,
  onCloneGithub,
  onGithubPush,
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
  onOpenExisting?: () => void;
  onCloneGithub?: () => void;
  onGithubPush?: (id: string) => void;
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
  // "+" → yeni proje / mevcut klasör aç seçim menüsü.
  const [newMenu, setNewMenu] = useState(false);
  useEffect(() => {
    if (!newMenu) return;
    const close = () => setNewMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [newMenu]);
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
        <span className="projectHeadActions">
          <button className="iconButton" onClick={(e) => { e.stopPropagation(); setNewMenu((o) => !o); }} title={text.addProject}>
            <Plus size={14} />
          </button>
          {newMenu && (
            <div className="rowMenu projectNewMenu" onMouseDown={(e) => e.stopPropagation()}>
              <button onClick={() => { setNewMenu(false); onCreate(); }}>
                <Plus size={13} /> {text.createNewProject}
              </button>
              {onOpenExisting && (
                <button onClick={() => { setNewMenu(false); onOpenExisting(); }}>
                  <FolderOpen size={13} /> {text.openExistingShort}
                </button>
              )}
              {onCloneGithub && (
                <button onClick={() => { setNewMenu(false); onCloneGithub(); }}>
                  <Github size={13} /> {text.githubCloneTitle}
                </button>
              )}
            </div>
          )}
        </span>
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
                      {onGithubPush && (
                        <button onClick={() => { setMenuFor(null); onGithubPush(p.id); }}>
                          <UploadCloud size={13} /> {text.githubPush}
                        </button>
                      )}
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

// CLI login'i GERÇEK terminal penceresinde yapılır (native — onboarding/ToS/kod orada
// sorunsuz çalışır). Dialog görsel adım adım rehber sunar ve giriş tamamlanınca otomatik algılar.
function LoginModal({
  tool, language, onClose, onAuthenticated
}: {
  tool: CliToolStatus;
  language: Language;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  const text = uiText[language];
  const [authed, setAuthed] = useState(false);
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const openedRef = useRef(false);
  useEffect(() => { openedRef.current = opened; }, [opened]);

  // Giriş tamamlandı mı diye yokla. agy: trust folder yazılınca TAM bitti say (REPL'e gelindi)
  // → pencereyi otomatik kapat. Diğerleri: cli-status authenticated yeter.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      let done = false;
      if (tool.id === "antigravity") {
        if (openedRef.current) {
          const r = await api.get<{ done: boolean }>(`/api/cli/${tool.id}/login-window/poll`).catch(() => null);
          done = Boolean(r?.done);
        }
      } else {
        const status = await api.get<CliStatusResponse>("/api/cli-status").catch(() => null);
        done = Boolean(status?.tools.find((x) => x.id === tool.id)?.authenticated);
      }
      if (!alive) return;
      if (done) {
        if (openedRef.current) void api.post(`/api/cli/${tool.id}/login-window/close`).catch(() => {}); // pencereyi kapat
        setAuthed(true);
        onAuthenticated();
        setTimeout(() => { if (alive) onClose(); }, 1600);
        return;
      }
      if (alive) setTimeout(() => void tick(), 2000);
    };
    setTimeout(() => void tick(), 2000);
    return () => { alive = false; };
  }, [tool.id]);

  // Görünür terminal penceresini aç ve login'i orada başlat.
  const openWindow = async () => {
    setOpening(true);
    try { await api.post(`/api/cli/${tool.id}/login-window`); setOpened(true); }
    catch { /* yok say */ }
    setOpening(false);
  };

  return (
    <div className="settingsOverlay loginOverlay" onMouseDown={onClose}>
      <div className="loginModal glassPanel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settingsHeader">
          <div className="panelTitle"><LogIn size={18} /><span>{displayToolName(tool.id)} — {text.login}</span></div>
          <button className="iconButton" onClick={onClose}><X size={18} /></button>
        </div>
        {authed ? (
          <div className="loginSuccess"><CheckCircle2 size={40} /><p>{text.loginDone}</p></div>
        ) : (
          <div className="loginBody">
            <p className="loginIntro">{text.loginWindowIntro}</p>
            {/* Açılan pencerede sırayla yapılacaklar — adımlar CLI'ya göre değişir.
                agy: yöntem+kod+renk+ToS+trust; claude/codex: sadece tarayıcı girişi. */}
            <ol className="loginSteps">
              {(tool.id === "antigravity"
                ? [
                    { t: text.guideMethodTitle, b: text.guideMethod },
                    { t: text.guideDeviceTitle, b: text.guideDevice },
                    { t: text.guideColorTitle, b: text.guideColor },
                    { t: text.guideTosTitle, b: text.guideTos },
                    { t: text.guideTrustTitle, b: text.guideTrust }
                  ]
                : [
                    { t: text.guideSimpleBrowserTitle, b: text.guideSimpleBrowser },
                    { t: text.guideSimpleDoneTitle, b: text.guideSimpleDone }
                  ]
              ).map((s, i) => (
                <li key={i}><span className="loginStepNo">{i + 1}</span><div><strong>{s.t}</strong><p>{s.b}</p></div></li>
              ))}
            </ol>
            {!opened ? (
              <button className="primaryButton loginOpenBtn" disabled={opening} onClick={() => void openWindow()}>
                <SquareTerminal size={16} /> {opening ? text.opening : text.openLoginWindow}
              </button>
            ) : (
              <div className="loginWaiting">
                <span className="liveSpinner" /> <span>{text.loginWindowOpened}</span>
                <button className="ghostButton" onClick={() => void openWindow()}><RefreshCw size={13} /> {text.reopenWindow}</button>
              </div>
            )}
            <p className="wizardHint">{text.loginAutoDetect}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function displayToolName(id: CliToolStatus["id"]) {
  if (id === "claude") return "Claude Code";
  if (id === "codex") return "OpenAI Codex";
  return "Antigravity CLI";
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
  onReview,
  running
}: {
  events: RunEvent[];
  language: Language;
  onOpenFile?: (path: string) => void;
  onReview?: () => void;
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
        <FileChangeBundle files={fileEvents} language={language} onOpenFile={onOpenFile} onReview={onReview} />
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

// Kronolojik akışta gösterilecek anlamlı event tipleri (ham stdout/stderr hariç).
const FEED_EVENT_TYPES = new Set<RunEvent["type"]>([
  "started", "agent_step", "file_created", "file_changed", "file_deleted", "fallback_used", "limit_detected"
]);
function isFeedEvent(e: RunEvent): boolean {
  if (FEED_EVENT_TYPES.has(e.type)) return true;
  // Ajan-seviyesi (agentId dolu) completed/failed → "X tamamladı/başarısız" satırı.
  if ((e.type === "completed" || e.type === "failed") && e.agentId) return true;
  return false;
}

// Tek akış satırının ikonu.
function feedIcon(e: RunEvent): React.ReactNode {
  if (e.type.startsWith("file_")) return <FileIcon size={12} />;
  if (e.type === "completed") return <CheckCircle2 size={12} />;
  if (e.type === "failed" || e.type === "limit_detected") return <AlertTriangle size={12} />;
  if (e.type === "fallback_used") return <RefreshCw size={12} />;
  return <Cpu size={12} />;
}

// Tek akış satırının metni (ajan adlarını korur; dosya olayları sadeleştirilir).
function feedLineText(e: RunEvent, t: { created: string; changed: string; deleted: string }): string {
  if (e.type === "file_created") return `${parseFileChange(e).path} ${t.created.toLocaleLowerCase("tr")}`;
  if (e.type === "file_changed") return `${parseFileChange(e).path} ${t.changed.toLocaleLowerCase("tr")}`;
  if (e.type === "file_deleted") return `${parseFileChange(e).path} ${t.deleted.toLocaleLowerCase("tr")}`;
  return (e.message || "").replace(/\s+/g, " ").trim();
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
  onOpenFile,
  onReview
}: {
  files: RunEvent[];
  language: Language;
  onOpenFile?: (path: string) => void;
  onReview?: () => void;
}) {
  const text = uiText[language];
  const [open, setOpen] = useState(false);
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
        <button className="fileBundleAction" onClick={() => onReview ? onReview() : setOpen((o) => !o)} title={text.review}>
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

function actionLabel(action: "login" | "logout" | "test" | "install", language: Language) {
  const text = uiText[language];
  if (action === "login") return text.login.toLowerCase();
  if (action === "logout") return text.logout.toLowerCase();
  if (action === "install") return text.install.toLowerCase();
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
  refreshKey = 0,
  label
}: {
  language: Language;
  onOpenFile: (path: string) => void;
  rootPath: string | null;
  refreshKey?: number;
  label?: string;
}) {
  const text = uiText[language];
  // Başlık: aktif klasör/proje adı (yoksa "Gezgin").
  const headTitle = label || (rootPath ? rootPath.split(/[\\/]/).filter(Boolean).pop() : "") || text.explorer;
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState(Boolean(rootPath));
  // Açık klasör yollarını effect içinde deps eklemeden okumak için.
  const expandedRef = useRef<Record<string, FileEntry[]>>({});
  expandedRef.current = expanded;

  const loadDir = useCallback(async (dirPath?: string) => {
    const target = dirPath ?? rootPath;
    if (!target) return [];
    const url = `/api/files?path=${encodeURIComponent(target)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries: FileEntry[] };
    return data.entries;
  }, [rootPath]);

  // Yalnızca kök/proje değişince ağacı sıfırla ve kökü yükle.
  useEffect(() => {
    setExpanded({});
    if (!rootPath) {
      setRootEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadDir().then((entries) => { setRootEntries(entries); setLoading(false); }).catch(() => setLoading(false));
  }, [loadDir, rootPath]);

  // Dosya değişiklik olayında (refreshKey) ağacı KAPATMADAN tazele:
  // kökü ve açık olan her dizini yeniden çek, açık durumları koru.
  useEffect(() => {
    if (!rootPath || refreshKey === 0) return;
    let cancelled = false;
    (async () => {
      const root = await loadDir();
      const paths = Object.keys(expandedRef.current);
      const pairs = await Promise.all(paths.map(async (p) => [p, await loadDir(p)] as const));
      if (cancelled) return;
      setRootEntries(root);
      if (pairs.length) {
        setExpanded((cur) => {
          const next = { ...cur };
          for (const [p, children] of pairs) if (p in next) next[p] = children;
          return next;
        });
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey, rootPath, loadDir]);

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
          <div className="explorerRowWrap">
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
          </div>
          {isOpen && expanded[entry.path] && renderEntries(expanded[entry.path], depth + 1)}
        </div>
      );
    });

  return (
    <section className="glassPanel fileExplorer">
      <div className="panelTitle split">
        <span title={rootPath ?? undefined}>
          <Folder size={15} />
          <span className="explorerTitleText">{headTitle}</span>
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

// VS Code marka logosu (tek renkli SVG).
function VsCodeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
    </svg>
  );
}

// Markalı "VS Code Aç" butonu — dosyayı/yolu VS Code'da açar.
function VsCodeButton({ path, label, compact }: { path: string; label: string; compact?: boolean }) {
  return (
    <button
      className={`vscodeOpenBtn${compact ? " compact" : ""}`}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        void fetch("/api/open-in-vscode", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path })
        }).catch((err) => console.error("[Orkestra] VS Code açılamadı:", err));
      }}
    >
      <VsCodeIcon size={compact ? 13 : 15} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

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
  const [copied, setCopied] = useState(false);
  const copyActive = async () => {
    if (!activeTab) return;
    try {
      await navigator.clipboard.writeText(activeTab.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("[Orkestra] kopyalanamadı:", err);
    }
  };

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
            <div className="fileDialogHeadActions">
              {activeTab && (
                <button
                  className="iconButton"
                  title={text.download}
                  onClick={() => {
                    const blob = new Blob([activeTab.content], { type: "text/plain;charset=utf-8" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = activeTab.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                  }}
                >
                  <Download size={15} />
                </button>
              )}
              {activeTab && (
                <button
                  className={`copyTextBtn${copied ? " copied" : ""}`}
                  title={copied ? text.copied : text.copyMessage}
                  onClick={copyActive}
                >
                  {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                  <span>{copied ? text.copied : text.copyMessage}</span>
                </button>
              )}
              {activeTab && <VsCodeButton path={activeTab.path} label={text.openInVscode} />}
              <button className="iconButton" onClick={onClose} title={text.close}>
                <X size={16} />
              </button>
            </div>
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

// Unified diff metnini renkli satırlara ayrıştırır (kırmızı/yeşil + satır no).
function renderDiffRows(diff: string): React.ReactNode {
  const lines = diff.split("\n");
  let oldLn = 0;
  let newLn = 0;
  const rows: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (
      line.startsWith("diff --git") || line.startsWith("index ") ||
      line.startsWith("--- ") || line.startsWith("+++ ") ||
      line.startsWith("new file") || line.startsWith("deleted file") ||
      line.startsWith("old mode") || line.startsWith("new mode") ||
      line.startsWith("similarity ") || line.startsWith("rename ") || line.startsWith("\\ No newline")
    ) return;
    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldLn = Number(m[1]); newLn = Number(m[2]); }
      rows.push(<div className="diffRow hunk" key={i}><span className="diffGutter" /><span className="diffGutter" /><code>{line}</code></div>);
      return;
    }
    if (line.startsWith("+")) {
      rows.push(<div className="diffRow add" key={i}><span className="diffGutter" /><span className="diffGutter">{newLn}</span><code>{line.slice(1) || " "}</code></div>);
      newLn++;
    } else if (line.startsWith("-")) {
      rows.push(<div className="diffRow del" key={i}><span className="diffGutter">{oldLn}</span><span className="diffGutter" /><code>{line.slice(1) || " "}</code></div>);
      oldLn++;
    } else {
      rows.push(<div className="diffRow ctx" key={i}><span className="diffGutter">{oldLn}</span><span className="diffGutter">{newLn}</span><code>{line.slice(1) || " "}</code></div>);
      oldLn++; newLn++;
    }
  });
  return rows;
}

// Sağ alan: VS Code tarzı working-tree diff paneli (terminal ile karşılıklı dışlayan).
function DiffPanel({
  language,
  files,
  loading,
  width,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  onRefresh,
  onOpenFile,
  onGithubPush,
  githubBusy,
  onClose
}: {
  language: Language;
  files: DiffFile[];
  loading: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  onRefresh: () => void;
  onOpenFile?: (path: string) => void;
  onGithubPush?: () => void;
  githubBusy?: boolean;
  onClose: () => void;
}) {
  const text = uiText[language];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // İlk yüklemede ilk dosyayı aç.
  useEffect(() => {
    setExpanded((prev) => (prev.size === 0 && files.length ? new Set([files[0].path]) : prev));
  }, [files]);

  const totalAdds = files.reduce((s, f) => s + f.adds, 0);
  const totalDels = files.reduce((s, f) => s + f.dels, 0);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    onResizeStart();
    const move = (ev: PointerEvent) => onWidthChange(Math.min(900, Math.max(320, startW + (startX - ev.clientX))));
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

  const toggle = (path: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });

  return (
    <section className="diffPanel">
      <div className="terminalResizer" onPointerDown={startResize} title={text.resizeTerminal} />
      <div className="diffPanelHead">
        <div className="diffPanelTitle">
          <GitCompare size={15} />
          <span>{text.changes}</span>
          {files.length > 0 && (
            <span className="diffPanelStat"><span className="diffAdd">+{totalAdds}</span> <span className="diffDel">-{totalDels}</span></span>
          )}
        </div>
        <div className="diffPanelActions">
          {onGithubPush && (
            <button className="ghostButton diffGithubBtn" onClick={onGithubPush} disabled={githubBusy} title={text.githubPush}>
              {githubBusy ? <span className="liveSpinner" /> : <UploadCloud size={14} />} {text.githubPush}
            </button>
          )}
          <button className="iconButton" onClick={onRefresh} title={text.refresh}><RefreshCw size={14} /></button>
          <button className="iconButton" onClick={onClose} title={text.close}><X size={15} /></button>
        </div>
      </div>
      <div className="diffPanelBody">
        {loading ? (
          <div className="diffPanelEmpty"><span className="liveSpinner" /> {text.readingCli}</div>
        ) : files.length === 0 ? (
          <div className="diffPanelEmpty">{text.noChanges}</div>
        ) : (
          files.map((f) => {
            const open = expanded.has(f.path);
            return (
              <div className={`diffFile${open ? " open" : ""}`} key={f.path}>
                <button className="diffFileHead" onClick={() => toggle(f.path)}>
                  <ChevronRight size={12} className={`explorerChevron${open ? " open" : ""}`} />
                  <span className="diffFileName" title={f.path}>{f.path}</span>
                  <span className="diffFileStat"><span className="diffAdd">+{f.adds}</span> <span className="diffDel">-{f.dels}</span></span>
                  {onOpenFile && (
                    <span
                      className="diffFileOpen"
                      title={text.openInVscode}
                      onClick={(e) => { e.stopPropagation(); onOpenFile(f.path); }}
                    >
                      <Code2 size={12} />
                    </span>
                  )}
                </button>
                {open && (
                  <div className="diffFileBody">
                    {f.binary ? <div className="diffBinary">{text.binaryFile}</div> : renderDiffRows(f.diff)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
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
  thinking, onModelChange, onChange, onSend, onStop, onClear, onCreateBrief, onCreatePlan, onStart,
  onContinueChat, onOperatorBuild, debateDone, operatorAnalyzing, phasePending, onResumePhase,
  codingActive, onExitCoding,
  participantSources, participants, onParticipantsChange, debateRounds, onRoundsChange,
  operatorSel, onOperatorChange, analysisReady,
  runActive, onAddNote, onStopRun,
  attachments, onAddImage, onOpenGithub, onRemoveImage,
  conversations, activeConversationId, onOpenConversation, onDeleteConversation, onNewChat,
  projects, activeProjectId, onSwitchProject, onNewProject, onDeleteProject,
  run, events, onOpenFile, onReview, cumulativeChanges = 0, onTogglePreview, previewOpen, previewAvailable
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
  onStop?: () => void;
  runActive: boolean;
  onAddNote: (note: string) => void;
  onStopRun: () => void;
  attachments: { path: string; name: string; preview: string; isImage: boolean }[];
  onAddImage: (file: File) => void;
  onOpenGithub?: () => void;
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
  onReview?: () => void;
  cumulativeChanges?: number;
  onTogglePreview: () => void;
  previewOpen: boolean;
  previewAvailable: boolean;
}) {
  const text = uiText[language];
  const plannerLabels = plannerLabelsByLanguage[language];
  const modeMeta = modeMetaByLanguage[language];
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
  const [showHistory, setShowHistory] = useState(false);
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
    // Stick-to-bottom: kullanıcı yukarı kaydırıp logları okuyorsa geri çekme.
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, events.length, thinking]);

  // ── Tek kronolojik akış (kod modu): kullanıcı/asistan mesajları + ajan adımları + dosya
  //    değişiklikleri zaman sırasına göre tek kolonda; her şey sırayla ekleniyor (CLI hissi). ──
  const timeline = useMemo(() => {
    type Item = { at: number; ord: number; el: React.ReactNode };
    const items: Item[] = [];
    messages.forEach((msg, i) => {
      const at = Date.parse(msg.createdAt || "") || 0;
      items.push({
        at,
        ord: i,
        el: msg.planner === "analysis" ? (
          <AnalysisCard key={`m-${msg.id ?? at}`} content={msg.content} modelLabel={msg.modelLabel} language={language} />
        ) : (
          <article key={`m-${msg.id ?? at}`} className={`chatBubble ${msg.role} compact`}>
            {msg.role === "assistant" && (
              <div className="messageMeta"><Bot size={12} /><span>{msg.modelLabel ?? "Orkestra"}</span></div>
            )}
            <pre>{msg.content}</pre>
            <div className="bubbleFooter"><CopyButton value={msg.content} label={text.copyMessage} copiedLabel={text.copied} /></div>
          </article>
        )
      });
    });
    events.forEach((e, i) => {
      if (!isFeedEvent(e)) return;
      const at = Date.parse(e.createdAt || "") || 0;
      const isFile = e.type.startsWith("file_");
      const fc = isFile ? parseFileChange(e) : null;
      items.push({
        at,
        ord: 100000 + i,
        el: (
          <div
            key={`e-${e.id}`}
            className={`activityLine ${e.type}${isFile && onOpenFile ? " clickable" : ""}`}
            onClick={() => (isFile && onOpenFile ? onOpenFile(fc!.path) : undefined)}
            title={isFile ? fc!.path : undefined}
          >
            <span className="activityIcon">{feedIcon(e)}</span>
            <span className="activityText">{feedLineText(e, text)}</span>
            {fc && (fc.adds > 0 || fc.dels > 0) && (
              <span className="activityDiff"><span className="diffAdd">+{fc.adds}</span> <span className="diffDel">-{fc.dels}</span></span>
            )}
            <time>{formatRunEventTime(e.createdAt)}</time>
          </div>
        )
      });
    });
    // Zamana göre sırala; eşit zamanlarda ekleme sırasını koru (kararlı).
    return items.sort((a, b) => a.at - b.at || a.ord - b.ord).map((it) => it.el);
  }, [messages, events, language, onOpenFile, text]);

  const fileTotals = computeFileTotals(events);
  // O an çalışan TÜM ajanlar (her ajanın son event'i completed/failed değilse aktif) →
  // paralel kodlama görünür olsun (tek ajan gibi durmasın).
  const activeAgents = useMemo(() => {
    const latest = new Map<string, RunEvent>();
    for (const e of events) {
      if (e.agentId) latest.set(e.agentId, e);
    }
    const out: { id: string; step: string }[] = [];
    for (const [id, e] of latest) {
      if (e.type === "completed" || e.type === "failed") continue;
      out.push({ id, step: (e.message || "").replace(/\s+/g, " ") });
    }
    return out;
  }, [events]);

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

      <div className="codeChatMessages" ref={scrollRef}>
        {/* Tek kronolojik akış: kullanıcı mesajı → ajan adımları → dosya değişiklikleri → final. */}
        {timeline}
        {/* Canlı "şu an ne yapılıyor" satırı (çalışırken, faz onayı beklemiyorken). */}
        {runActive && !phasePending && (
          activeAgents.length > 0 ? (
            activeAgents.map((a) => (
              <div className="activityLine working" key={a.id}>
                <span className="liveSpinner" />
                <span className="activityText">{a.step || text.working}</span>
              </div>
            ))
          ) : (
            <div className="activityLine working">
              <span className="liveSpinner" />
              <span className="activityText">{text.working}</span>
            </div>
          )
        )}
        {/* İncele: değişiklik oldukça (run sırasında her fazda da) en altta görünür — Claude Code gibi. */}
        {onReview && (fileTotals.count > 0 || cumulativeChanges > 0) && (
          <button className="activityReviewLine" onClick={() => onReview?.()}>
            <Diamond size={13} />
            {fileTotals.count > 0 ? (
              <>
                <span>{fileTotals.count} {text.fileEditedNoun}</span>
                <span className="activityDiff"><span className="diffAdd">+{fileTotals.adds}</span> <span className="diffDel">-{fileTotals.dels}</span></span>
              </>
            ) : (
              <span>{cumulativeChanges} {text.fileEditedNoun}</span>
            )}
            <span className="activityReviewBtn">{text.review}</span>
          </button>
        )}
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
            {/* Gerçek faz bitişinde run "running" (awaiting) kalır → "Faz tamamlandı".
                STOP/duraklatmada status "failed" olur → "Duraklatıldı" (yanlışlıkla faz bitti demesin). */}
            <span className="phasePendingHint">{run?.status === "failed" ? text.pausedHint : text.phaseDoneHint}</span>
            <button className="analysisActionBtn operator" onClick={onResumePhase}>
              <Play size={14} />
              {text.phaseContinue}
            </button>
            {run?.status !== "failed" && (
              <button className="analysisActionBtn" onClick={onStopRun}>
                <X size={14} />
                {text.stop}
              </button>
            )}
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
        {runActive ? (
          /* Run aktif: interaktif ajan ayarları gizli; küçük salt-okunur mod çipi. */
          <div className="runModeChip">
            {mode === "debate" ? <Swords size={12} /> : <Bot size={12} />}
            <span>{modeMeta[mode].label}{participants.length > 1 ? ` · ${participants.length} ${language === "tr" ? "ajan" : "agents"}` : ""}</span>
          </div>
        ) : (
          <>
            {/* Kod modunda "Çoklu Ajan" YOK → yalnızca Tek Ajan + Tartışma. */}
            <div className="modeSwitch compact codeModeSwitch">
              {(["single", "debate"] as ChatMode[]).map((item) => {
                const disabled = item !== "single" && !multiAvailable;
                return (
                  <button
                    key={item}
                    className={`modeTab${mode === item ? " on" : ""}${item === "debate" ? " debate" : ""}`}
                    disabled={disabled}
                    onClick={() => onModeChange(item)}
                    title={modeMeta[item].desc}
                  >
                    {item === "single" ? <Bot size={13} /> : <Swords size={13} />}
                    {modeMeta[item].label}
                  </button>
                );
              })}
              {codingActive && (
                <button className="modeExitBtn" onClick={onExitCoding} title={text.backToDebateTitle}>
                  <Swords size={12} /> {text.backToDebate}
                </button>
              )}
            </div>
            {mode === "debate" && (
              <div className="debateControls compact">
                <ModelPicker
                  language={language}
                  sources={participantSources}
                  mode="multi"
                  participants={participants}
                  onParticipantsChange={onParticipantsChange}
                />
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
              </div>
            )}
          </>
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
                  <AttachMenu language={language} onPickFile={() => fileInputRef.current?.click()} onOpenGithub={onOpenGithub} />
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
                  ) : thinking ? (
                    <button className="iconRound sendCircle stopCircle" onClick={() => onStop?.()} title={text.stop}>
                      <Square size={14} />
                    </button>
                  ) : (
                    <button
                      className="iconRound sendCircle"
                      disabled={(!value.trim() && !attachments.length) || !cliOptions.length}
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
  const [info, setInfo] = useState<{ type: "vite" | "static" | "none"; entry?: string }>({ type: "none" });
  const [vite, setVite] = useState<{ status: string; url: string } | null>(null);
  // DOĞRUDAN backend (8787): göreli URL Vite SPA fallback'ine düşüp Orkestra arayüzünü gösteriyordu.
  // CORS backend'de açık. localhost→127.0.0.1 (IPv6 ::1 bağlantı reddini önler).
  const backendHost = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
  const backendOrigin = `${window.location.protocol}//${backendHost}:8787`;

  // 1) Proje tipini (+ statik giriş) algıla.
  useEffect(() => {
    let cancelled = false;
    if (!run) { setInfo({ type: "none" }); setVite(null); return; }
    fetch(`${backendOrigin}/api/preview/info/${run.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { type?: "vite" | "static" | "none"; entry?: string } | null) => {
        if (!cancelled) setInfo({ type: d?.type ?? "none", entry: d?.entry });
      })
      .catch(() => { if (!cancelled) setInfo({ type: "none" }); });
    return () => { cancelled = true; };
  }, [run?.id, refreshKey, backendOrigin]);

  // 2) Vite ise dev sunucusunu başlat ve durumu poll'la.
  useEffect(() => {
    if (!run || info.type !== "vite") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = (d: { status?: string; url?: string } | null) => {
      if (cancelled || !d?.url) return;
      setVite({ status: d.status ?? "starting", url: d.url });
      if (d.status !== "ready" && d.status !== "error") timer = setTimeout(poll, 1500);
    };
    const poll = () => {
      fetch(`${backendOrigin}/api/preview/status/${run.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(apply)
        .catch(() => { if (!cancelled) timer = setTimeout(poll, 2000); });
    };
    fetch(`${backendOrigin}/api/preview/start/${run.id}`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then(apply)
      .catch(() => {});
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [run?.id, info.type, refreshKey, backendOrigin]);

  const staticUrl = run && info.type === "static" && info.entry ? `${backendOrigin}/preview/${run.id}/${info.entry}` : null;
  const viteReady = info.type === "vite" && vite?.status === "ready" ? vite.url : null;
  const previewUrl = staticUrl ?? viteReady;
  const viteLoading = info.type === "vite" && vite && vite.status !== "ready" && vite.status !== "error";
  const viteError = info.type === "vite" && vite?.status === "error";

  return (
    <section className="glassPanel browserPreview">
      <div className="previewHeader">
        <div className="panelTitle">
          <Globe size={15} />
          <span>{text.preview}</span>
        </div>
        <div className="previewActions">
          {previewUrl && (
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
        {previewUrl ? (
          <iframe key={`${refreshKey}-${previewUrl}`} src={previewUrl} className="previewFrame" title="Preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        ) : viteLoading ? (
          <div className="previewEmpty">
            <span className="liveSpinner" />
            <h4>{vite?.status === "installing" ? text.previewInstalling : text.previewStarting}</h4>
            <p>{text.noPreviewDesc}</p>
          </div>
        ) : viteError ? (
          <div className="previewEmpty">
            <AlertTriangle size={34} />
            <h4>{text.previewError}</h4>
          </div>
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

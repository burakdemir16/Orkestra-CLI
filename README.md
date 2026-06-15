# 🎹 Orkestra

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-red.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-v8.0-purple.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-v19.0-blue.svg)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-green.svg)](https://sqlite.org/)

**Orkestra** is a premium, local-first AI Agent Studio designed to orchestrate local CLI agents (such as `claude-code`, `codex`, and `gemini-cli`/`agy`) into unified multi-agent development pipelines.

Unlike traditional platforms that rely on expensive direct API integrations, Orkestra acts as a smart wrapper around CLI tools already installed and authenticated on your machine, saving tokens while maintaining complete execution control.

---

## 🌟 Key Features

*   **⚡ Local-First Orchestration**: Wraps local CLI tools directly from your terminal session. Bypasses direct API billing using active logged-in sessions.
*   **🛠️ Standardized Multi-Agent Workflow**: Runs tasks through a structured four-stage role pipeline:
    $$\text{Planner} \longrightarrow \text{Builder} \longrightarrow \text{Reviewer} \longrightarrow \text{Fixer}$$
*   **🔄 Dynamic Failover & Fallback**: Automatically scans console outputs (`stdout`/`stderr`) for rate limits (429), quota errors, or timeout patterns. If an agent is blocked, Orkestra dynamically reroutes tasks to predefined fallback agents.
*   **📊 Live Usage & Limit Dashboard**: Queries live usage statistics and limits (such as Anthropic 5-hour and weekly quotas) directly from local credentials files.
*   **💬 Chat vs. Code Isolation**: Prevents chat history bloat. Conversations are handled in the Chat dashboard and transformed into a concise **Code Task Brief** before execution.
*   **🔒 Secure Git Publisher**: Scans modified files, automatically filters out secret keys (`.env`, private keys, credentials), commits local modifications to a new branch, pushes, and creates a draft PR.

---

## 🗺️ How it Works

```
 ┌─────────────────────────────────────────────────────────┐
 │                   Orkestra Dashboard                    │
 └────────────────────────────┬────────────────────────────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  Claude CLI  │ │  Codex CLI   │ │  Gemini CLI  │
     └──────────────┘ └──────────────┘ └──────────────┘
```

1.  **Chat (Decide)**: Brainstorm architecture, ideas, and strategies with selected planners.
2.  **Brief**: Compile a clean task summary outlining features, constraints, and success criteria.
3.  **Run (Code)**: Run the agent pipeline in isolated workspace directories (`workspaces/run-xxx`).
4.  **Publish**: Safely commit, push, and open a draft pull request.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (version 20 or higher) and the relevant CLIs installed:

*   **Claude Code CLI**: `npm install -g @anthropic-ai/claude-code` (Make sure `claude` is authenticated)
*   **OpenAI Codex CLI**: `npm install -g @openai/codex`
*   **Antigravity / Gemini CLI**: `agy` or `gemini` commands configured.

### Installation

1. Clone the repository and navigate to the directory:
   ```powershell
   git clone https://github.com/burakdemir16/Orkestra-CLI.git
   cd Orkestra-CLI
   ```
2. Install the workspace dependencies:
   ```powershell
   npm install
   ```
3. Start the development server (runs both Fastify Backend and Vite Frontend concurrently):
   ```powershell
   npm run dev
   ```

*   **Frontend Panel**: `http://127.0.0.1:5173`
*   **Backend Server**: `http://127.0.0.1:8787`

---

## 🔧 Command Templates

Ajan ayarlarında `command` ve `argsTemplate` tanımlanır. Orkestra çalışma anında aşağıdaki değişkenleri dinamik olarak yerleştirir:

*   `{prompt}`: Kullanıcının görevi ve önceki ajanların çıktıları.
*   `{workspace}`: İzole çalışma klasörü.
*   `{transcript}`: Önceki ajanların tüm yazışma geçmişi.
*   `{role}`: Ajanın üstlendiği rol.

#### Example Configuration (Claude Agent)
*   **Command**: `claude`
*   **Arguments**: `["-p", "{prompt}", "--effort", "low"]`

---

## 🐚 PowerShell Automation (`orchestra-run.ps1`)

For terminal lovers, Orkestra includes [orchestra-run.ps1](file:///c:/Users/Burak/OneDrive/Belgeler/orkestra/orchestra-run.ps1), a PowerShell script that executes the same orchestrator logic directly in your terminal:

```powershell
./orchestra-run.ps1 -Task "Create a beautiful modern portfolio website" -ProjectDir "my-portfolio"
```

It automates the following steps:
1.  **Planner (Codex)**: Designs the system structure and writes `01-plan.md`.
2.  **Builder (Claude)**: Writes code directly to files (`index.html`, `styles.css`, `script.js`).
3.  **Reviewer (Gemini/Antigravity)**: Audits the generated files and lists adjustments in `02-review.md`.
4.  **Fixer (Claude)**: Corrects code based on reviewer notes.

---

## 📦 Project Structure

```text
├── apps/
│   ├── server/             # Fastify backend (SQLite DB, CLI execution, Git service)
│   └── web/                # React (Vite, CSS Variables, glassmorphism dashboard)
├── packages/
│   └── shared/             # TypeScript shared types
├── docs/                   # Architectural documentation
├── scripts/                # Helper login scripts
└── workspaces/             # Isolated run directory outputs
```

---

## 📝 License

Distributed under the PolyForm Noncommercial License 1.0.0. See `LICENSE` for more information.

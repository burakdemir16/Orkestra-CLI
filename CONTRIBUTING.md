# Contributing to Orkestra

Thanks for your interest — contributions are very welcome! Issues, ideas, docs, and PRs all help.

> **License note:** Orkestra is released under the **Apache License 2.0**. By contributing, you agree your contribution is provided under the same license. See [`LICENSE`](LICENSE).

## Getting started

```bash
git clone https://github.com/burakdemir16/Orkestra-CLI.git
cd Orkestra-CLI
npm install
npm run dev        # Fastify backend (127.0.0.1:8787) + Vite web (127.0.0.1:5173)
```

- **Node.js 20+** required. Git is **not** required (bundled via `dugite`).
- No compiler/Python needed — storage is a dependency-free JSON store; `node-pty` (terminal) is optional.
- To orchestrate real agents you need at least one CLI installed & logged in: Claude Code (`claude`), OpenAI Codex (`codex`), or Antigravity/Gemini (`agy`). The in-app setup wizard can install/authenticate them.

## Project layout

```
apps/
  server/src/        Fastify backend
    index.ts         HTTP routes, SSE, terminals, GitHub & preview APIs
    runner.ts        spawns & orchestrates the AI CLI agents (phases, fallback)
    cli.ts           CLI detection, chat/plan/debate, language handling
    git.ts           embedded Git (dugite): diff, baseline, clone, push
    github.ts        GitHub REST + OAuth Device Flow + encrypted token store
    preview.ts       live dev-server preview manager
    db.ts            dependency-free JSON store
  web/src/main.tsx   React + Vite single-page studio (chat + code modes)
packages/shared/     shared TypeScript types
```

## Before opening a PR

```bash
# type-check the server
cd apps/server && npx tsc --noEmit
# type-check + build the web app (from repo root)
npm run build
# run tests
npm test
```

- Keep changes focused; one concern per PR.
- Match the surrounding code style (the codebase favors small, commented functions; comments are often in Turkish — English is fine too).
- UI strings live in `uiText` (EN + TR) in `apps/web/src/main.tsx` — add both languages.
- User-facing AI output should follow the user's language (see `detectLang` / language directives) — don't hardcode a single language.
- Don't commit secrets, `data/`, `workspaces/`, or generated folders (already in `.gitignore`).

## How to contribute

1. Open an **issue** first for anything non-trivial (bug, feature, design) so we can align.
2. Fork → branch (`feat/...` or `fix/...`) → PR. Draft PRs are welcome for early feedback.
3. Describe what changed and why; include repro steps for bugs.

## Good first issues / ideas

- **Pre-write diff approval mode** — review and approve changes *before* agents write them (today review is post-write + git rollback).
- **Cross-platform support** — macOS/Linux folder picker and token storage (currently Windows: native picker + DPAPI). Add keychain/libsecret equivalents.
- **More CLI adapters** — pluggable adapters for additional coding CLIs.
- **More UI languages** beyond EN/TR.
- **Tests** — extend coverage for `runner`, `git`, and `github` modules.
- **Per-project repo settings** — remember default branch / private flag per project.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, your OS + Node version, and any console/server logs.

Thanks for helping make Orkestra better! 🎹

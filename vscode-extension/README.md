# Orkestra for VS Code

Brings [Orkestra](https://github.com/burakdemir16/Orkestra-CLI)'s local-first Agent Studio — chat/debate with `claude-code`, `codex` and `gemini-cli`/`agy`, multi-agent team runs, live diff review, and GitHub publishing — into a VS Code sidebar panel, the same way the Claude Code and Codex CLI extensions dock next to your editor.

This extension does **not** reimplement Orkestra's UI. It drives the same local Fastify server (`127.0.0.1:8787` by default) that the `orkestra` CLI starts, and embeds its existing React dashboard inside a VS Code webview. All requests stay on `127.0.0.1`; nothing is proxied off your machine.

## Requirements

One of:
- `orkestra-cli` installed globally: `npm install -g orkestra-cli`
- Or an `Orkestra-CLI` source checkout, pointed to via the `orkestra.serverPath` setting (the folder containing `bin/orkestra.mjs`)

## Usage

- Click the Orkestra icon in the Activity Bar to open the Agent Studio panel. If no server is reachable at the configured host/port, the extension starts one for you (`orkestra.autoStart`).
- **Orkestra: Start Server** / **Orkestra: Stop Server** — manage the local server manually.
- **Orkestra: Open in Browser** — open the same dashboard in your default browser.
- **Orkestra: Focus Agent Studio** — reveal the panel.

If the extension started the server itself, it stops it again when VS Code closes. A server you launched separately (e.g. from a terminal) is left running.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `orkestra.host` | `127.0.0.1` | Host the local Orkestra server listens on. |
| `orkestra.port` | `8787` | Port the local Orkestra server listens on. |
| `orkestra.autoStart` | `true` | Auto-start the server when the panel opens if none is running. |
| `orkestra.serverPath` | `""` | Path to an `Orkestra-CLI` checkout to run from source instead of the global CLI. |

## Development

```bash
cd vscode-extension
npm install
npm run watch
```

Press `F5` in VS Code (with this folder open) to launch an Extension Development Host.

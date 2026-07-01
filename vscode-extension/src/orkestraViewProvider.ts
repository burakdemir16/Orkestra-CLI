import * as vscode from "vscode";
import { ServerManager, ServerTarget, checkHealth, getTarget } from "./serverManager";

export class OrkestraViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "orkestra.panel";

  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly serverManager: ServerManager,
    private readonly output: vscode.OutputChannel
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, enableForms: true };

    const config = vscode.workspace.getConfiguration("orkestra");
    const autoStart = config.get<boolean>("autoStart", true);
    const target = getTarget();

    let healthy = await checkHealth(target);
    if (!healthy && autoStart) {
      webviewView.webview.html = this.renderStatus(target, "Starting Orkestra server…");
      healthy = await this.serverManager.ensureRunning(target);
    }

    webviewView.webview.html = healthy
      ? this.renderApp(webviewView.webview, target)
      : this.renderStatus(
          target,
          "Could not reach the Orkestra server. Install it with `npm install -g orkestra-cli`, " +
            "or point `orkestra.serverPath` at a source checkout, then run \"Orkestra: Start Server\"."
        );
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand("orkestra.panel.focus");
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    this.view.webview.html = "";
    await this.resolveWebviewView(this.view);
  }

  private renderApp(webview: vscode.Webview, target: ServerTarget): string {
    const csp = [
      `default-src 'none'`,
      `frame-src ${target.url}`,
      `connect-src ${target.url}`,
      `style-src 'unsafe-inline'`
    ].join("; ");
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="${target.url}" title="Orkestra Agent Studio" allow="clipboard-read; clipboard-write; microphone"></iframe>
</body>
</html>`;
  }

  private renderStatus(target: ServerTarget, message: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 1rem; }
    code { background: var(--vscode-textCodeBlock-background); padding: 0.1rem 0.3rem; border-radius: 3px; }
  </style>
</head>
<body>
  <p>${escapeHtml(message)}</p>
  <p>Target: <code>${escapeHtml(target.url)}</code></p>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

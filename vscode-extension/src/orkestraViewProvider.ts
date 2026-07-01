import * as vscode from "vscode";
import { checkHealth, getTarget } from "./serverManager";

/**
 * Slim sidebar launcher. Orkestra's own UI needs desktop width (see
 * studioPanel.ts), so this view just surfaces status + a button that opens
 * the full studio as a wide editor tab, instead of squeezing the app itself
 * into the narrow sidebar.
 */
export class OrkestraViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "orkestra.panel";

  private view: vscode.WebviewView | undefined;

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.type === "open") {
        void vscode.commands.executeCommand("orkestra.openStudio");
      }
    });
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    const target = getTarget();
    const healthy = await checkHealth(target);
    this.view.webview.html = this.render(healthy, target.url);
  }

  private render(healthy: boolean, url: string): string {
    const status = healthy
      ? `<span class="dot on"></span> Server running at <code>${url}</code>`
      : `<span class="dot off"></span> Server not running`;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0.75rem; }
    p { font-size: 0.9em; opacity: 0.85; }
    code { background: var(--vscode-textCodeBlock-background); padding: 0.1rem 0.3rem; border-radius: 3px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
    .dot.on { background: #3fb950; }
    .dot.off { background: #8b949e; }
    button {
      width: 100%; margin-top: 0.75rem; padding: 6px 10px; cursor: pointer;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 2px; font-size: 0.9em;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <p>${status}</p>
  <button id="open">Open Agent Studio</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById("open").addEventListener("click", () => {
      vscode.postMessage({ type: "open" });
    });
  </script>
</body>
</html>`;
  }
}

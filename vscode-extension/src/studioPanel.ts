import * as vscode from "vscode";
import { ServerManager, ServerTarget, checkHealth, getTarget } from "./serverManager";

/**
 * Orkestra's own UI is a wide, multi-column desktop layout (see README's
 * "three-column code workspace"). A ~300px sidebar squeezes its top bar into
 * overlapping icons, so the full studio opens as a normal editor tab instead —
 * same width as a browser tab — while the sidebar view stays a slim launcher.
 */
export class StudioPanel {
  private static current: StudioPanel | undefined;

  static async openOrReveal(serverManager: ServerManager, output: vscode.OutputChannel): Promise<void> {
    if (StudioPanel.current) {
      StudioPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const target = getTarget();
    const panel = vscode.window.createWebviewPanel(
      "orkestra.studio",
      "Orkestra Agent Studio",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    StudioPanel.current = new StudioPanel(panel);

    const config = vscode.workspace.getConfiguration("orkestra");
    const autoStart = config.get<boolean>("autoStart", true);

    let healthy = await checkHealth(target);
    if (!healthy && autoStart) {
      panel.webview.html = renderStatus(target, "Starting Orkestra server…");
      healthy = await serverManager.ensureRunning(target);
    }

    panel.webview.html = healthy
      ? renderApp(target)
      : renderStatus(
          target,
          "Could not reach the Orkestra server. Install it with `npm install -g orkestra-cli`, " +
            "or point `orkestra.serverPath` at a source checkout, then run \"Orkestra: Start Server\"."
        );

    if (!healthy) {
      output.appendLine(`[orkestra] Studio tab opened but server at ${target.url} is not reachable.`);
    }
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => {
      StudioPanel.current = undefined;
    });
  }
}

function renderApp(target: ServerTarget): string {
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

function renderStatus(target: ServerTarget, message: string): string {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

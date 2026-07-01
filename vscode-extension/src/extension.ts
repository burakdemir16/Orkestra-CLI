import * as vscode from "vscode";
import { ServerManager, getTarget } from "./serverManager";
import { OrkestraViewProvider } from "./orkestraViewProvider";
import { StudioPanel } from "./studioPanel";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Orkestra");
  const serverManager = new ServerManager(output);
  const provider = new OrkestraViewProvider(() => {
    void vscode.commands.executeCommand("orkestra.openStudio");
  });

  context.subscriptions.push(
    output,
    serverManager,
    vscode.window.registerWebviewViewProvider(OrkestraViewProvider.viewId, provider),

    vscode.commands.registerCommand("orkestra.startServer", async () => {
      const target = getTarget();
      const ok = await serverManager.ensureRunning(target);
      if (ok) {
        vscode.window.showInformationMessage(`Orkestra server is running at ${target.url}.`);
        await provider.refresh();
      } else {
        vscode.window.showErrorMessage("Failed to start the Orkestra server. See the \"Orkestra\" output channel for details.");
        output.show();
      }
    }),

    vscode.commands.registerCommand("orkestra.stopServer", () => {
      serverManager.stop();
      void provider.refresh();
    }),

    vscode.commands.registerCommand("orkestra.openInBrowser", async () => {
      const target = getTarget();
      await vscode.env.openExternal(vscode.Uri.parse(target.url));
    }),

    vscode.commands.registerCommand("orkestra.focusPanel", async () => {
      await vscode.commands.executeCommand("orkestra.panel.focus");
    }),

    vscode.commands.registerCommand("orkestra.openStudio", async () => {
      await StudioPanel.openOrReveal(serverManager, output);
      await provider.refresh();
    })
  );
}

export function deactivate(): void {
  // ServerManager.dispose() (registered in subscriptions) stops any process this
  // extension started; a server the user launched independently is left running.
}

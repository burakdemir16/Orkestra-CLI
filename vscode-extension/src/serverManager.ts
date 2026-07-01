import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import { ChildProcess, spawn } from "node:child_process";
import * as vscode from "vscode";

export interface ServerTarget {
  host: string;
  port: number;
  url: string;
}

export function getTarget(): ServerTarget {
  const config = vscode.workspace.getConfiguration("orkestra");
  const host = config.get<string>("host", "127.0.0.1");
  const port = config.get<number>("port", 8787);
  return { host, port, url: `http://${host}:${port}` };
}

export function checkHealth(target: ServerTarget, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${target.url}/api/health`, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Manages a locally-spawned Orkestra Fastify server. Only tracks/kills the process
 * this extension itself started — a server the user launched separately (e.g. via
 * `orkestra` in a terminal) is left alone on deactivate.
 */
export class ServerManager implements vscode.Disposable {
  private child: ChildProcess | undefined;
  private readonly output: vscode.OutputChannel;

  constructor(output: vscode.OutputChannel) {
    this.output = output;
  }

  get isManaged(): boolean {
    return this.child !== undefined && this.child.exitCode === null;
  }

  async ensureRunning(target: ServerTarget): Promise<boolean> {
    if (await checkHealth(target)) return true;
    if (this.isManaged) return false;
    return this.start(target);
  }

  private async start(target: ServerTarget): Promise<boolean> {
    const config = vscode.workspace.getConfiguration("orkestra");
    const configuredRoot = config.get<string>("serverPath", "").trim();
    const launcher = resolveLauncher(configuredRoot);
    if (!launcher) {
      this.output.appendLine(
        "[orkestra] No launcher found. Install the CLI globally (`npm install -g orkestra-cli`) " +
          "or set the `orkestra.serverPath` setting to an Orkestra-CLI checkout."
      );
      return false;
    }

    this.output.appendLine(`[orkestra] Starting server via ${launcher.description} → ${target.url}`);
    this.child = spawn(launcher.command, launcher.args, {
      cwd: launcher.cwd,
      env: {
        ...process.env,
        ORKESTRA_HOST: target.host,
        ORKESTRA_PORT: String(target.port),
        ORKESTRA_NO_BROWSER: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child.stdout?.on("data", (chunk) => this.output.append(chunk.toString()));
    this.child.stderr?.on("data", (chunk) => this.output.append(chunk.toString()));
    this.child.on("exit", (code) => {
      this.output.appendLine(`[orkestra] Server process exited (code ${code ?? "unknown"}).`);
      this.child = undefined;
    });

    return waitForHealth(target);
  }

  stop(): void {
    if (this.child && this.child.exitCode === null) {
      this.output.appendLine("[orkestra] Stopping server.");
      this.child.kill();
    }
    this.child = undefined;
  }

  dispose(): void {
    this.stop();
  }
}

interface Launcher {
  command: string;
  args: string[];
  cwd: string | undefined;
  description: string;
}

function resolveLauncher(configuredRoot: string): Launcher | undefined {
  if (configuredRoot) {
    const binPath = path.join(configuredRoot, "bin", "orkestra.mjs");
    if (fs.existsSync(binPath)) {
      return {
        command: process.execPath,
        args: [binPath],
        cwd: configuredRoot,
        description: `source checkout at ${configuredRoot}`
      };
    }
    // Not fatal: fall through to the global CLI.
  }
  return {
    command: process.platform === "win32" ? "orkestra.cmd" : "orkestra",
    args: [],
    cwd: undefined,
    description: "globally installed 'orkestra' CLI"
  };
}

async function waitForHealth(target: ServerTarget, attempts = 30, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await checkHealth(target)) return true;
    await sleep(delayMs);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

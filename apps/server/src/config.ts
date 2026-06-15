import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  workspaceDir: string;
}

export function loadDotEnv(file = ".env") {
  const envPath = resolve(process.cwd(), file);
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function getConfig(): AppConfig {
  loadDotEnv();
  const dataDir = resolve(process.cwd(), process.env.ORKESTRA_DATA_DIR ?? "data");
  const workspaceDir = resolve(process.cwd(), process.env.ORKESTRA_WORKSPACE_DIR ?? "workspaces");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });

  return {
    host: process.env.ORKESTRA_HOST ?? "127.0.0.1",
    port: Number(process.env.ORKESTRA_PORT ?? 8787),
    dataDir,
    workspaceDir
  };
}

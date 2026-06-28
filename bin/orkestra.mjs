#!/usr/bin/env node
// Orkestra global başlatıcı: `orkestra` komutu Fastify sunucusunu başlatır (derlenmiş web
// arayüzünü de servis eder) ve tarayıcıyı açar. Global npm kurulumu için.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(pkgRoot, "apps", "server", "src", "index.ts");

// tsx CLI'yi paketin kendi bağımlılığından çöz.
let tsxCli;
try {
  tsxCli = require.resolve("tsx/dist/cli.mjs");
} catch {
  tsxCli = join(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");
}

const host = process.env.ORKESTRA_HOST || "127.0.0.1";
const port = process.env.ORKESTRA_PORT || "8787";
const url = `http://${host}:${port}`;

// Veri ve workspace'leri kullanıcının ev dizininde tut (paket klasörünü kirletme, OneDrive dışı).
const home = process.env.USERPROFILE || process.env.HOME || pkgRoot;
const base = join(home, ".orkestra");
process.env.ORKESTRA_DATA_DIR ||= join(base, "data");
process.env.ORKESTRA_WORKSPACE_DIR ||= join(base, "workspaces");

if (!existsSync(join(pkgRoot, "dist", "web"))) {
  console.warn("[orkestra] Web arayüzü derlenmemiş (dist/web yok). `npm run build` gerekebilir.");
}

console.log(`[orkestra] Başlatılıyor → ${url}`);
const child = spawn(process.execPath, [tsxCli, serverEntry], {
  cwd: pkgRoot,
  stdio: "inherit",
  env: process.env
});
child.on("exit", (code) => process.exit(code ?? 0));

// Sunucu ayağa kalkınca tarayıcıyı aç.
setTimeout(() => {
  const cmd =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* tarayıcı açılamadıysa kullanıcı URL'yi elle açar */
  }
}, 1800);

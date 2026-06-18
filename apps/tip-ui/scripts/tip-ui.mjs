#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

const [, , command, ...rest] = process.argv;

function printUsage() {
  console.error("Usage: tip-ui open <server-url>");
}

function spawnPnpm(args) {
  const child = spawn("pnpm", args, {
    cwd: appRoot,
    stdio: "inherit",
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.once("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

if (command !== "open") {
  printUsage();
  process.exit(1);
}

const [serverUrl] = rest;

if (!serverUrl) {
  printUsage();
  process.exit(1);
}

spawnPnpm([
  "tauri",
  "dev",
  "--no-watch",
  "--",
  "--",
  "--server",
  serverUrl,
]);

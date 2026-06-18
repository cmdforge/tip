#!/usr/bin/env node

import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const tipUiTauriBin = path.join(
  repoRoot,
  "apps",
  "tip-ui",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "ui" ? rawArgs.slice(1) : rawArgs;

function runPnpm(pnpmArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", pnpmArgs, {
      cwd: repoRoot,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

if (!fs.existsSync(tipUiTauriBin)) {
  const installCode = await runPnpm(["install"]);

  if (installCode !== 0) {
    process.exit(installCode);
  }
}

const execCode = await runPnpm([
  "--filter",
  "@cmdforge/tip-ui",
  "exec",
  "node",
  "./scripts/tip-ui.mjs",
  ...args,
]);

process.exit(execCode);

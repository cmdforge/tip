#!/usr/bin/env node

import { spawn } from "node:child_process";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "ui" ? rawArgs.slice(1) : rawArgs;

function printUsage() {
  console.error("Usage: ui open <server-url>");
}

function toDevArgs(cliArgs) {
  if (cliArgs.length === 0) {
    return [];
  }

  if (cliArgs[0] === "open") {
    const serverUrl = cliArgs[1];

    if (!serverUrl) {
      printUsage();
      process.exit(1);
    }

    return ["--", "--server", serverUrl];
  }

  return ["--", ...cliArgs];
}

function runPnpm(pnpmArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", pnpmArgs, {
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

const execCode = await runPnpm([
  "--filter",
  "@cmdforge/tip-ui",
  "dev",
  ...toDevArgs(args),
]);

process.exit(execCode);

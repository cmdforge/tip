#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function printUsage() {
  console.error("Usage: tip-ui open <server-url>");
}

function parseCliArgs(argv) {
  const args = argv[0] === "tip-ui" ? argv.slice(1) : argv;

  if (args.length === 0) {
    return [];
  }

  if (args[0] === "open") {
    const serverUrl = args[1];

    if (!serverUrl) {
      printUsage();
      process.exit(1);
    }

    return ["--server", serverUrl];
  }

  return args;
}

function resolveElectronBinary() {
  return require("electron");
}

function assertBuildExists() {
  const mainEntry = path.join(packageRoot, "out", "main", "index.js");

  if (!existsSync(mainEntry)) {
    console.error(`Missing built Electron main entry at ${mainEntry}`);
    console.error("Run `pnpm --filter @cmdforge/tip-ui build` before launching tip-ui from source.");
    process.exit(1);
  }
}

async function main() {
  assertBuildExists();

  const electronBinary = resolveElectronBinary();
  const electronArgs = parseCliArgs(process.argv.slice(2));

  await new Promise((resolve, reject) => {
    const child = spawn(electronBinary, [packageRoot, ...electronArgs], {
      cwd: packageRoot,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exit(code ?? 0);
    });
    child.once("spawn", resolve);
  });
}

await main();

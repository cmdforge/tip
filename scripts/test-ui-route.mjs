#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const defaultUrl = "https://mcp.dev.azure.com";
const serverUrl = process.argv[2] ?? defaultUrl;

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      stderr += `${error}\n`;
      resolve({
        code: 1,
        stdout,
        stderr,
      });
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function extractAllowBuildSpec(output) {
  const match = output.match(/allowBuilds:\s*\n\s+(.+): true/m);
  return match?.[1]?.trim();
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tip-ui-route-"));
  const pack = await run(
    "pnpm",
    ["pack", "--pack-destination", tempDir],
    repoRoot,
  );

  if (pack.code !== 0) {
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exit(pack.code);
  }

  const tarballEntries = await fs.readdir(tempDir);
  const tarballName = tarballEntries.find((entry) => entry.endsWith(".tgz"));

  if (!tarballName) {
    console.error("Could not find packed tarball in temporary directory.");
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exit(1);
  }

  const tarballPath = path.join(tempDir, tarballName);
const baseArgs = ["dlx", tarballPath, "ui", "open", serverUrl];
  const first = await run("pnpm", baseArgs, tempDir);

  if (first.code === 0) {
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exit(0);
  }

  const combinedOutput = `${first.stdout}\n${first.stderr}`;

  if (!combinedOutput.includes("ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED")) {
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exit(first.code);
  }

  const allowBuildSpec = extractAllowBuildSpec(combinedOutput);

  if (!allowBuildSpec) {
    console.error(
      "Found ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED but could not extract the suggested --allow-build package spec.",
    );
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exit(first.code);
  }

  console.error(`Retrying with --allow-build=${allowBuildSpec}`);

  const retry = await run("pnpm", [
    "dlx",
    `--allow-build=${allowBuildSpec}`,
    tarballPath,
    "ui",
    "open",
    serverUrl,
  ], tempDir);

  await fs.rm(tempDir, { recursive: true, force: true });
  process.exit(retry.code);
}

await main();

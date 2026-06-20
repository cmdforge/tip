import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { DaemonInfo } from "../shared/index.js";

export const names = {
  daemon() { return 'manager'; },
  lock() { return `${this.daemon()}.lock`; },
  info() { return `${this.daemon()}.json`; },
  stdout() { return `${this.daemon()}.stdout.log`; },
  stderr() { return `${this.daemon()}.stderr.log`; },
};

export const paths = {
  async ensure(folder: string) { await fs.mkdir(folder, { recursive: true }); return folder; },
  async root() { return await this.ensure(path.join(os.homedir(), '.cmdforge', 'tip')); },
  async lock() { return await this.ensure(path.join(await paths.root(), names.lock())); },
  async info() { return path.join(await paths.root(), names.info()); },
  async stdout() { return path.join(await this.root(), names.stdout()); },
  async stderr() { return path.join(await this.root(), names.stderr()); },
};

export const files = {
  async lock() { return await fs.open(await paths.lock(), 'w'); },
  async info() { return await fs.open(await paths.info(), 'w'); },
  async stdout() { return await fs.open(await paths.stdout(), 'a'); },
  async stderr() { return await fs.open(await paths.stderr(), 'a'); },
};

let startupPromise: Promise<DaemonInfo> | undefined;
export function ensureManagerStarted(): Promise<DaemonInfo> {
  startupPromise ??= ensureDaemonStartedCore().finally(() => {
    startupPromise = undefined;
  });

  return startupPromise;
}

async function ensureDaemonStartedCore(): Promise<DaemonInfo> {
  const existing = await readExistingDaemon();
  if (existing) return existing;

  await acquireLock();

  try {
    const existingAfterLock = await readExistingDaemon();
    if (existingAfterLock) return existingAfterLock;

    return await startDaemon();
  } finally {
    await releaseLock();
  }
}

async function readExistingDaemon(): Promise<DaemonInfo | undefined> {
  try {
    const raw = await fs.readFile(infoFile, "utf8");
    const info = JSON.parse(raw) as DaemonInfo;

    if (!Number.isInteger(info.pid) || !info.url) return undefined;
    if (!(await isProcessAlive(info.pid))) return undefined;
    if (!(await canConnectToWebSocketUrl(info.url))) return undefined;

    return info;
  } catch {
    return undefined;
  }
}

async function startDaemon(): Promise<DaemonInfo> {
  const stdout = createWriteStream(stdoutFile, { flags: "a" });
  const stderr = createWriteStream(stderrFile, { flags: "a" });

  const child = spawn(process.execPath, [path.join(__dirname, "daemon.js")], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);

  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start daemon.");
  }

  const info = await waitForDaemonReady(child.pid);

  await fs.writeFile(infoFile, JSON.stringify(info, null, 2), "utf8");

  return info;
}

async function waitForDaemonReady(pid: number): Promise<DaemonInfo> {
  // Easiest: have daemon print its URL as first stdout line, or write its own ready file.
  // Example assumes daemon writes JSON to a known file once listening.
  const readyFile = path.join(stateDir, "ready.json");

  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(readyFile, "utf8");
      const { url } = JSON.parse(raw);

      if (url && await canConnectToWebSocketUrl(url)) {
        return { pid, url };
      }
    } catch {
      // not ready yet
    }

    await sleep(100);
  }

  throw new Error("Daemon did not become ready in time.");
}

async function acquireLock(): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      await fs.mkdir(lockDir);
      return;
    } catch {
      await sleep(50);
    }
  }

  throw new Error("Timed out waiting for daemon startup lock.");
}

async function releaseLock(): Promise<void> {
  await fs.rm(lockDir, { recursive: true, force: true });
}

async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function canConnectToWebSocketUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port);
    const host = parsed.hostname;

    if (!port) return false;

    return await new Promise<boolean>((resolve) => {
      const socket = net.connect(port, host);

      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.once("error", () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
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
  async lock() { return path.join(await paths.root(), names.lock()); },
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

  const lockOrDaemon = await acquireLockOrReadExistingDaemon();
  if ("pid" in lockOrDaemon) {
    return lockOrDaemon;
  }

  try {
    const existingAfterLock = await readExistingDaemon();
    if (existingAfterLock) return existingAfterLock;

    return await startDaemon();
  } finally {
    await releaseLock(lockOrDaemon);
  }
}

async function readExistingDaemon(): Promise<DaemonInfo | undefined> {
  try {
    const raw = await fs.readFile(await paths.info(), "utf8");
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
  const stdout = await files.stdout();
  const stderr = await files.stderr();
  const cwd = await paths.root();

  const child = spawn("npx", ["-y", "@cmdforge/tip-manager"], {
    cwd,
    detached: true,
    stdio: ["ignore", stdout.fd, stderr.fd, "ipc"],
    windowsHide: true,
  });

  try {
    if (!child.pid) {
      throw new Error("Failed to start daemon.");
    }

    const info = await waitForDaemonReadyOverIpc(child);

    await fs.writeFile(await paths.info(), JSON.stringify(info, null, 2), "utf8");
    child.unref();

    return info;
  } finally {
    await stdout.close();
    await stderr.close();
  }
}

async function waitForDaemonReadyOverIpc(
  child: ReturnType<typeof spawn>,
): Promise<DaemonInfo> {
  const deadline = Date.now() + 15_000;

  return await new Promise<DaemonInfo>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const cleanup = () => {
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
      clearTimeout(timeout);
    };

    const onMessage = (value: unknown) => {
      if (!isDaemonInfo(value)) {
        return;
      }

      finish(() => resolve(value));
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(() => {
        reject(
          new Error(
            `Daemon exited before reporting ready state (${signal ?? code ?? "unknown"})`,
          ),
        );
      });
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Daemon did not become ready in time.")));
    }, Math.max(0, deadline - Date.now()));

    child.on("message", onMessage);
    child.on("error", onError);
    child.on("exit", onExit);
  });
}

type StartupLock = {
  file: FileHandle;
  token: string;
};

async function acquireLockOrReadExistingDaemon(): Promise<StartupLock | DaemonInfo> {
  const deadline = Date.now() + 10_000;
  const lockPath = await paths.lock();
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  while (Date.now() < deadline) {
    const existing = await readExistingDaemon();
    if (existing) {
      return existing;
    }

    try {
      const file = await fs.open(lockPath, "wx");
      await file.writeFile(token, "utf8");
      return { file, token };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      if (await clearStaleLock(lockPath)) {
        continue;
      }

      const existingAfterContention = await readExistingDaemon();
      if (existingAfterContention) {
        return existingAfterContention;
      }

      await sleep(50);
    }
  }

  throw new Error("Timed out waiting for daemon startup lock.");
}

async function releaseLock(lock: StartupLock): Promise<void> {
  try {
    await lock.file.close();
  } catch {
    // ignore
  }

  try {
    const contents = await fs.readFile(await paths.lock(), "utf8");
    if (contents === lock.token) {
      await fs.rm(await paths.lock(), { force: true });
    }
  } catch {
    // ignore
  }
}

async function clearStaleLock(lockPath: string): Promise<boolean> {
  try {
    const contents = await fs.readFile(lockPath, "utf8");
    const ownerPid = parseLockOwnerPid(contents);

    if (ownerPid !== undefined && await isProcessAlive(ownerPid)) {
      return false;
    }

    await fs.rm(lockPath, { force: true });
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return true;
    }

    return false;
  }
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

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseLockOwnerPid(contents: string): number | undefined {
  const [first] = contents.trim().split(":");
  const pid = Number.parseInt(first ?? "", 10);
  return Number.isInteger(pid) ? pid : undefined;
}

function isDaemonInfo(value: unknown): value is DaemonInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    "pid" in value &&
    "url" in value &&
    Number.isInteger((value as { pid: unknown }).pid) &&
    typeof (value as { url: unknown }).url === "string"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

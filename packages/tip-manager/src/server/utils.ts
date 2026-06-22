import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { ServerJson } from "../shared/index.js";
import type { ManagerClientPeer } from "../client/index.js";
import { clientFactory } from "../client/index.js";
import type { TipServerRegisterResult } from "../shared/protocol.js";

export interface DaemonInfo {
  pid: number;
  url: string;
}

export type StartupLock = {
  file: FileHandle;
  token: string;
};

export const tipServerSchemaUrl =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

export interface TipServerStartupOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export interface CreateTipServerJsonOptions {
  name: string;
  description: string;
  title?: string;
  version?: string;
  websiteUrl?: string;
  startup: TipServerStartupOptions;
}

export const names = {
  daemon() { return "manager"; },
  lock() { return `${this.daemon()}.lock`; },
  info() { return `${this.daemon()}.json`; },
  stdout() { return `${this.daemon()}.stdout.log`; },
  stderr() { return `${this.daemon()}.stderr.log`; },
};

export const paths = {
  async ensure(folder: string) {
    await fs.mkdir(folder, { recursive: true });
    return folder;
  },
  async root() {
    return await this.ensure(path.join(os.homedir(), ".cmdforge", "tip"));
  },
  async lock() {
    return path.join(await this.root(), names.lock());
  },
  async info() {
    return path.join(await this.root(), names.info());
  },
  async stdout() {
    return path.join(await this.root(), names.stdout());
  },
  async stderr() {
    return path.join(await this.root(), names.stderr());
  },
};

export const files = {
  async stdout() {
    return await fs.open(await paths.stdout(), "a");
  },
  async stderr() {
    return await fs.open(await paths.stderr(), "a");
  },
};

let startupPromise: Promise<DaemonInfo> | undefined;

export function ensureManagerRunning(): Promise<DaemonInfo> {
  startupPromise ??= ensureManagerRunningCore().finally(() => {
    startupPromise = undefined;
  });

  return startupPromise;
}

export async function connectToManager(): Promise<ManagerClientPeer> {
  const info = await ensureManagerRunning();
  return await clientFactory.connectWebSocket(info.url);
}

export async function registerTipServer(
  server: ServerJson,
): Promise<TipServerRegisterResult> {
  const peer = await connectToManager();

  try {
    return await peer.outbound.requests.tip.register({
      server,
    });
  } finally {
    closePeer(peer);
  }
}

export function createTipServerJson(options: CreateTipServerJsonOptions): ServerJson {
  return {
    $schema: tipServerSchemaUrl,
    name: options.name,
    description: options.description,
    version: options.version ?? "0.0.0",
    ...(options.title ? { title: options.title } : {}),
    ...(options.websiteUrl ? { websiteUrl: options.websiteUrl } : {}),
    packages: [
      startupToPackage(options.startup),
    ],
  };
}

export async function readExistingDaemon(): Promise<DaemonInfo | undefined> {
  try {
    const raw = await fs.readFile(await paths.info(), "utf8");
    const info = JSON.parse(raw) as DaemonInfo;

    if (!isDaemonInfo(info)) return undefined;
    if (!(await isProcessAlive(info.pid))) return undefined;
    if (!(await canConnectToWebSocketUrl(info.url))) return undefined;

    return info;
  } catch {
    return undefined;
  }
}

export async function acquireLockOrReadExistingDaemon(): Promise<StartupLock | DaemonInfo> {
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

export async function writeDaemonInfo(info: DaemonInfo): Promise<void> {
  await fs.writeFile(await paths.info(), JSON.stringify(info, null, 2), "utf8");
}

export async function clearOwnedDaemonInfo(info: DaemonInfo): Promise<void> {
  try {
    const raw = await fs.readFile(await paths.info(), "utf8");
    const current = JSON.parse(raw) as DaemonInfo;

    if (current.pid !== info.pid || current.url !== info.url) {
      return;
    }

    await fs.rm(await paths.info(), { force: true });
  } catch {
    // ignore
  }
}

export async function releaseStartupLock(lock: StartupLock): Promise<void> {
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

async function ensureManagerRunningCore(): Promise<DaemonInfo> {
  const existing = await readExistingDaemon();
  if (existing) return existing;

  return await startDaemon();
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

function closePeer(peer: ManagerClientPeer) {
  const connection = peer.connection as {
    end?: () => void;
    dispose?: () => void;
  };

  connection.end?.();
  connection.dispose?.();
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

function parseLockOwnerPid(contents: string): number | undefined {
  const [first] = contents.trim().split(":");
  const pid = Number.parseInt(first ?? "", 10);
  return Number.isInteger(pid) ? pid : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startupToPackage(startup: TipServerStartupOptions): NonNullable<ServerJson["packages"]>[number] {
  if (startup.cwd) {
    throw new Error("cwd is not supported in server.json package entries.");
  }

  const runtime = normalizeRuntime(startup.command, startup.args ?? []);
  const environmentVariables = startup.env
    ? Object.entries(startup.env)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, value]) => ({
        name,
        value,
      }))
    : undefined;

  return {
    registryType: runtime.registryType,
    identifier: runtime.identifier,
    runtimeHint: runtime.runtimeHint,
    transport: {
      type: "stdio",
    },
    ...(runtime.runtimeArguments.length > 0 ? { runtimeArguments: runtime.runtimeArguments } : {}),
    ...(runtime.packageArguments.length > 0 ? { packageArguments: runtime.packageArguments } : {}),
    ...(environmentVariables && environmentVariables.length > 0 ? { environmentVariables } : {}),
  };
}

function normalizeRuntime(command: string, args: string[]) {
  switch (command) {
    case "npx":
      return normalizePackagedRuntime("npm", "npx", args);
    case "uvx":
      return normalizePackagedRuntime("pypi", "uvx", args);
    case "docker":
      return normalizeDockerRuntime(args);
    case "pnpm":
      return normalizePnpmRuntime(args);
    default:
      throw new Error(`Unsupported startup command for server.json package translation: ${command}`);
  }
}

function normalizePackagedRuntime(registryType: string, runtimeHint: string, args: string[]) {
  const packageIndex = findPackageIdentifierIndex(args);
  if (packageIndex < 0) {
    throw new Error(`Unable to determine package identifier for ${runtimeHint}.`);
  }

  return {
    registryType,
    runtimeHint,
    identifier: args[packageIndex],
    runtimeArguments: toArguments(args.slice(0, packageIndex)),
    packageArguments: toArguments(args.slice(packageIndex + 1)),
  };
}

function normalizePnpmRuntime(args: string[]) {
  if (args[0] !== "dlx") {
    throw new Error("pnpm startup translation currently only supports `pnpm dlx`.");
  }

  const packageIndex = findPackageIdentifierIndex(args, 1);
  if (packageIndex < 0) {
    throw new Error("Unable to determine package identifier for pnpm dlx.");
  }

  return {
    registryType: "npm",
    runtimeHint: "pnpm",
    identifier: args[packageIndex],
    runtimeArguments: toArguments(args.slice(0, packageIndex)),
    packageArguments: toArguments(args.slice(packageIndex + 1)),
  };
}

function normalizeDockerRuntime(args: string[]) {
  if (args[0] !== "run") {
    throw new Error("docker startup translation currently only supports `docker run`.");
  }

  const imageIndex = findPackageIdentifierIndex(args, 1);
  if (imageIndex < 0) {
    throw new Error("Unable to determine docker image identifier.");
  }

  return {
    registryType: "oci",
    runtimeHint: "docker",
    identifier: args[imageIndex],
    runtimeArguments: toArguments(args.slice(0, imageIndex)),
    packageArguments: toArguments(args.slice(imageIndex + 1)),
  };
}

function findPackageIdentifierIndex(args: string[], start = 0) {
  for (let index = start; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("-")) {
      return index;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("-")) {
      index += 1;
    }
  }

  return -1;
}

function toArguments(args: string[]) {
  const result: Array<{ type: "named" | "positional"; name?: string; value?: string }> = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value.startsWith("-")) {
      const next = args[index + 1];
      if (next && !next.startsWith("-")) {
        result.push({
          type: "named",
          name: value,
          value: next,
        });
        index += 1;
        continue;
      }

      result.push({
        type: "named",
        name: value,
      });
      continue;
    }

    result.push({
      type: "positional",
      value,
    });
  }

  return result;
}

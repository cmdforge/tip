#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { serverFactory } from "../server/index.js";

async function main() {
  const app = readRequiredApp(process.argv.slice(2));
  const state = getStatePaths(app);

  await mkdir(state.appDir, {
    recursive: true,
  });

  const existing = await readLiveLock(state.lockFile);
  if (existing) {
    process.stdout.write(
      JSON.stringify({
        type: "ws-url",
        url: existing.url,
        app,
        manager: "reused",
      }) + "\n",
    );

    await waitForPong(process.stdin);
    return;
  }

  const started = await serverFactory.startWebSocket({
    host: "127.0.0.1",
    path: "/",
    port: 0,
  });

  await writeLock(state.lockFile, started.url);
  installSignalHandlers(async () => {
    await started.close();
    await deleteLockIfOwned(state.lockFile);
  });

  process.stdout.write(
    JSON.stringify({
      type: "ws-url",
      url: started.url,
      app,
      manager: "started",
    }) + "\n",
  );

  await waitForPong(process.stdin);
  try {
    await started.closed;
  } finally {
    await deleteLockIfOwned(state.lockFile);
  }
}

function installSignalHandlers(close: () => Promise<void>) {
  const onSignal = async () => {
    try {
      await close();
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", () => {
    void onSignal();
  });

  process.once("SIGTERM", () => {
    void onSignal();
  });
}

async function waitForPong(stdin: NodeJS.ReadStream) {
  stdin.setEncoding("utf8");

  let buffer = "";
  for await (const chunk of stdin) {
    buffer += chunk;

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (isPong(line)) {
        return;
      }
    }
  }

  throw new Error("stdin ended before receiving pong handshake");
}

function isPong(line: string) {
  if (line === "pong") {
    return true;
  }

  if (!line) {
    return false;
  }

  try {
    const value = JSON.parse(line) as {
      type?: unknown;
    };

    return value.type === "pong";
  } catch {
    return false;
  }
}

function readRequiredApp(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--app") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("missing value for --app");
      }

      return value;
    }
  }

  throw new Error('missing required --app "my app" argument');
}

function getStatePaths(app: string) {
  const rootDir = path.join(os.homedir(), ".cmdforge/tip-manager");
  const appDir = path.join(rootDir, "apps", sanitizeApp(app));
  const lockFile = path.join(rootDir, "port.lock");

  return {
    rootDir,
    appDir,
    lockFile,
  };
}

function sanitizeApp(app: string) {
  return app.replace(/[\\/]/g, "-");
}

async function readLiveLock(lockFile: string) {
  try {
    const contents = await readFile(lockFile, {
      encoding: "utf8",
    });
    const lock = JSON.parse(contents) as {
      pid?: unknown;
      url?: unknown;
    };

    if (typeof lock.url !== "string") {
      return undefined;
    }

    const live = await isLiveWsUrl(lock.url);
    if (!live) {
      await rm(lockFile, {
        force: true,
      });
      return undefined;
    }

    return {
      pid: typeof lock.pid === "number" ? lock.pid : undefined,
      url: lock.url,
    };
  } catch {
    return undefined;
  }
}

async function writeLock(lockFile: string, url: string) {
  await mkdir(path.dirname(lockFile), {
    recursive: true,
  });

  await writeFile(
    lockFile,
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        url,
      },
      null,
      2,
    ),
  );
}

async function deleteLockIfOwned(lockFile: string) {
  try {
    const contents = await readFile(lockFile, {
      encoding: "utf8",
    });
    const lock = JSON.parse(contents) as {
      pid?: unknown;
    };

    if (lock.pid === process.pid) {
      await rm(lockFile, {
        force: true,
      });
    }
  } catch {
    // ignore cleanup errors
  }
}

async function isLiveWsUrl(urlString: string) {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (!parsed.port) {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port),
    });

    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

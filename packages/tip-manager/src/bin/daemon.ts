#!/usr/bin/env node

import fs from "node:fs";
import {
  acquireLockOrReadExistingDaemon,
  clearOwnedDaemonInfo,
  type DaemonInfo,
  releaseStartupLock,
  writeDaemonInfo,
} from "../server/utils.js";
import { serverFactory } from "../server/index.js";

async function main() {
  const lockOrDaemon = await acquireLockOrReadExistingDaemon();
  if ("pid" in lockOrDaemon) {
    await reportReady(lockOrDaemon);
    return;
  }

  let started: Awaited<ReturnType<typeof serverFactory.startWebSocket>> | undefined;
  let info: DaemonInfo | undefined;

  try {
    started = await serverFactory.startWebSocket({
      host: "127.0.0.1",
      path: "/",
      port: 0,
    });
    info = {
      pid: process.pid,
      url: started.url,
    };

    installTerminationHandlers(async () => {
      await started?.close();
      if (info) {
        await clearOwnedDaemonInfo(info);
      }
    });

    await writeDaemonInfo(info);
    await reportReady(info);
  } catch (error) {
    await started?.close();
    if (info) {
      await clearOwnedDaemonInfo(info);
    }
    throw error;
  } finally {
    await releaseStartupLock(lockOrDaemon);
  }

  await started.closed;
  await clearOwnedDaemonInfo(info);
}

function installTerminationHandlers(close: () => Promise<void>) {
  let closing = false;

  const shutdown = async () => {
    if (closing) {
      return;
    }

    closing = true;

    try {
      await close();
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", () => {
    void shutdown();
  });

  process.once("SIGTERM", () => {
    void shutdown();
  });
}

async function reportReady(info: DaemonInfo) {
  if (typeof process.send === "function") {
    await new Promise<void>((resolve, reject) => {
      process.send?.(info, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    if (typeof process.disconnect === "function") {
      process.disconnect();
    }

    return;
  }

  if (!(await hasWritableFd(3))) {
    return;
  }

  await writeToFd(3, `${JSON.stringify(info)}\n`);
}

async function hasWritableFd(fd: number): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      fs.fstat(fd, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    return true;
  } catch {
    return false;
  }
}

async function writeToFd(fd: number, data: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fs.write(fd, data, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

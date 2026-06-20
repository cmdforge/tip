#!/usr/bin/env node

import { serverFactory } from "../server/index.js";

type DaemonInfo = {
  pid: number;
  url: string;
};

async function main() {
  const started = await serverFactory.startWebSocket({
    host: "127.0.0.1",
    path: "/",
    port: 0,
  });

  installTerminationHandlers(async () => {
    await started.close();
  });

  await reportReady({
    pid: process.pid,
    url: started.url,
  });

  await started.closed;
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

  process.stdout.write(`${JSON.stringify(info)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

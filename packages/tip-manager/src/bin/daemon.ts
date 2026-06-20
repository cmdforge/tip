
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { Readable } from "node:stream";

export function delay(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function timeout(ms = 1000) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller;
}

export function withExclusiveLock<T>(lockPath: string, atomic: () => T | Promise<T>, ms = 10000) {
  return new Promise<T>(async (resolve, reject) => {
    const { signal } = timeout(ms);
    while (true) {
      try {
        signal.throwIfAborted();
        const fh = await fs.open(lockPath, "wx");
        try {
          const result = await atomic();
          return resolve(result);
        } finally {
          await fh.close();
          await fs.unlink(lockPath);
        }
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code !== "EEXIST")
          return reject(err);
        await delay(100);
      }
    }
  });
}

function makeLockManager(ms = 10000) {
  const handle: typeof fs.open = (path, flags?) => {
    return new Promise<T>(async (resolve, reject) => {
      const { signal } = timeout(ms);
      while (true) {
        try {
          try { await fs.unlink(path); } catch { }
          signal.throwIfAborted();
          const fh = await fs.open(path, flags);
          try {
            const result = await atomic();
            return resolve(result);
          } finally {
            await fh.close();
            await fs.unlink(lockPath);
          }
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException)?.code !== "EEXIST")
            return reject(err);
          await delay(100);
        }
      }
    });
  }

  return { acquireExclusiveFile };
}

export async function ensureManagerRunning() {
  const out = fs.open("./worker.log", "a+");
  const err = openSync("./worker.err.log", "ax");

  const child = spawn(process.execPath, ["worker.js"], {
    detached: true,

    // fd 0: ignore stdin
    // fd 1: stdout -> log file
    // fd 2: stderr -> log file
    // fd 3: readiness pipe back to parent
    stdio: ["ignore", out, err, "pipe"],
  });

  // Parent no longer needs its copies of the log fds.
  closeSync(out);
  closeSync(err);

  const readyPipe = child.stdio[3] as Readable;
  readyPipe.setEncoding("utf8");

  await new Promise<void>((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      readyPipe.removeAllListeners();
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      readyPipe.destroy();
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `Worker exited before ready. code=${code}, signal=${signal}`
        )
      );
    };

    readyPipe.on("data", chunk => {
      buffer += chunk;

      if (buffer.includes("READY\n")) {
        cleanup();

        // This is the actual "let it live independently" step.
        child.unref();

        resolve();
      }
    });

    child.once("error", onError);
    child.once("exit", onExit);
  });

  return {
    pid: child.pid,
    stdout: "./worker.log",
    stderr: "./worker.err.log",
  };
}

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

type DaemonInfo = {
  pid: number;
  url: string;
};

const daemonPath = fileURLToPath(new URL("./daemon.ts", import.meta.url));

test("daemon reports an existing singleton instance instead of starting a second one", async (t) => {
  if (!(await supportsTcpListen())) {
    t.skip("local TCP listen is not permitted in this environment");
    return;
  }

  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "tip-manager-daemon-"));
  const infoPath = path.join(homeDir, ".cmdforge", "tip", "manager.json");
  const fetchStubPath = path.join(homeDir, "stub-fetch.mjs");
  await fs.writeFile(
    fetchStubPath,
    "globalThis.fetch = async () => new Response(JSON.stringify({ servers: [], metadata: {} }), { headers: { 'content-type': 'application/json' } });\n",
    "utf8",
  );

  const first = spawnDaemon(homeDir, fetchStubPath);

  try {
    const firstInfo = await first.ready;
    const second = spawnDaemon(homeDir, fetchStubPath);

    try {
      const secondInfo = await second.ready;
      assert.deepEqual(secondInfo, firstInfo);

      const secondExit = await waitForExit(second.child);
      assert.equal(secondExit.code, 0);

      const written = JSON.parse(await fs.readFile(infoPath, "utf8")) as DaemonInfo;
      assert.deepEqual(written, firstInfo);
    } finally {
      await stopChild(second.child);
    }
  } finally {
    await stopChild(first.child);
    await waitForInfoRemoval(infoPath);
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});

function spawnDaemon(homeDir: string, fetchStubPath: string) {
  const child = spawn(process.execPath, ["--import", fetchStubPath, "--import", "tsx", daemonPath], {
    cwd: path.dirname(path.dirname(daemonPath)),
    env: {
      ...process.env,
      HOME: homeDir,
    },
    stdio: ["ignore", "ignore", "pipe", "pipe"],
  });

  const ready = readDaemonInfo(child.stdio[3] as Readable);
  return { child, ready };
}

async function readDaemonInfo(stream: Readable): Promise<DaemonInfo> {
  return await new Promise<DaemonInfo>((resolve, reject) => {
    let settled = false;
    let buffer = "";

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("error", onError);
      stream.off("close", onClose);
      fn();
    };

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      finish(() => resolve(JSON.parse(line) as DaemonInfo));
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    const onClose = () => {
      finish(() => reject(new Error("daemon closed before reporting ready state")));
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error("timed out waiting for daemon readiness")));
    }, 10_000);

    stream.on("data", onData);
    stream.on("error", onError);
    stream.on("close", onClose);
  });
}

async function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForInfoRemoval(infoPath: string): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    try {
      await fs.access(infoPath);
    } catch {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`timed out waiting for daemon info cleanup: ${infoPath}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await waitForExit(child).catch(() => {});
}

async function supportsTcpListen(): Promise<boolean> {
  const server = net.createServer();

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    return true;
  } catch {
    return false;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

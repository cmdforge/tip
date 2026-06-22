import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import net from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createManagerInstance, startPackageBridge } from "./manager.js";
import { registryClient } from "./registry-client.js";
import { killManagerIfRunning } from "./utils.js";

// Ensure no external manager daemon is running before tests that spawn package bridges
// run a before hook provided by the existing 'test' import below
test.before(async () => {
  await killManagerIfRunning().catch(() => {});
});
import type { ServerResponse } from "../shared/index.js";

function officialEntry(
  name: string,
  version: string,
  isLatest: boolean,
  overrides: Partial<ServerResponse["server"]> = {},
): ServerResponse {
  return {
    server: {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name,
      description: `${name} ${version}`,
      version,
      ...overrides,
    },
    _meta: {
      "io.modelcontextprotocol.registry/official": {
        isLatest,
        status: "active",
        statusChangedAt: "2026-01-01T00:00:00.000Z",
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
}

test("connectOfficialServer uses the latest version when no version is specified", async () => {
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [
        officialEntry("io.github.cmdforge/weather", "1.0.0", false, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4000/" }],
        }),
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4100/" }],
        }),
      ];
    },
  });

  const connected = await manager.connectOfficialServer({
    name: "io.github.cmdforge/weather",
    target: { type: "remote", index: 0 },
  });

  assert.equal(connected.url, "ws://127.0.0.1:4100/");
});

test("connectOfficialServer accepts name@version selection", async () => {
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [
        officialEntry("io.github.cmdforge/weather", "1.0.0", false, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4000/" }],
        }),
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4100/" }],
        }),
      ];
    },
  });

  const connected = await manager.connectOfficialServer({
    name: "io.github.cmdforge/weather@1.0.0",
    target: { type: "remote", index: 0 },
  });

  assert.equal(connected.url, "ws://127.0.0.1:4000/");
});

test("connectOfficialServer accepts an explicit version parameter", async () => {
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [
        officialEntry("io.github.cmdforge/weather", "1.0.0", false, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4000/" }],
        }),
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4100/" }],
        }),
      ];
    },
  });

  const connected = await manager.connectOfficialServer({
    name: "io.github.cmdforge/weather",
    version: "1.0.0",
    target: { type: "remote", index: 0 },
  });

  assert.equal(connected.url, "ws://127.0.0.1:4000/");
});

test("getOfficialServers does not load the registry until first use", async () => {
  let loadCount = 0;
  const manager = createManagerInstance({
    async loadOfficialServers() {
      loadCount += 1;
      return [
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          remotes: [{ type: "websocket", url: "ws://127.0.0.1:4100/" }],
        }),
      ];
    },
  });

  assert.equal(loadCount, 0);

  const first = await manager.getOfficialServers({});
  assert.equal(loadCount, 1);
  assert.equal(first.total, 1);

  const second = await manager.getOfficialServers({});
  assert.equal(second.total, 1);
  assert.equal(loadCount, 1);
});

test("getOfficialServers stops when the registry repeats a pagination cursor", async () => {
  const originalGet = registryClient.GET.bind(registryClient);
  let callCount = 0;

  registryClient.GET = (async (...args: Parameters<typeof registryClient.GET>) => {
    callCount += 1;

    return {
      data: {
        servers: [],
        metadata: {
          nextCursor: "stuck-cursor",
        },
      },
      error: undefined,
      response: new Response(),
    };
  }) as typeof registryClient.GET;

  try {
    const manager = createManagerInstance();

    await assert.rejects(
      manager.getOfficialServers({}),
      /Registry pagination repeated cursor: stuck-cursor/i,
    );
    assert.equal(callCount, 2);
  } finally {
    registryClient.GET = originalGet as typeof registryClient.GET;
  }
});

test("connectOfficialServer surfaces package bridge startup failures", async () => {
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          packages: [{
            registryType: "npm",
            identifier: "@cmdforge/weather",
            transport: { type: "stdio" },
          }],
        }),
      ];
    },
    async startPackageBridge() {
      throw new Error("Package launch failed for @cmdforge/weather");
    },
  });

  await assert.rejects(
    manager.connectOfficialServer({
      name: "io.github.cmdforge/weather",
      target: { type: "package", index: 0 },
    }),
    /Unable to determine runtime command|Package launch failed|listen EPERM/i,
  );
});

test("connectOfficialServer starts stdio package targets as local MCP endpoints", async () => {
  if (!(await supportsPackageBridgeFixture())) {
    return;
  }

  const fixture = fileURLToPath(new URL("./fixtures/stdio-mcp-server.mjs", import.meta.url));
  const startedBridges: Array<{ close(): Promise<void> }> = [];
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          packages: [{
            registryType: "npm",
            runtimeHint: "node",
            identifier: fixture,
            transport: { type: "stdio" },
          }],
        }),
      ];
    },
    async startPackageBridge(pkg) {
      const bridge = await startPackageBridge(pkg);
      startedBridges.push(bridge);
      return bridge;
    },
  });

  try {
    const connected = await manager.connectOfficialServer({
      name: "io.github.cmdforge/weather",
      target: { type: "package", index: 0 },
    });

    assert.match(connected.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    await assert.doesNotReject(() => pingServer(connected.url));
  } finally {
    await closeAll(startedBridges);
  }
});

test("connectOfficialServer retries runtimeArguments as package arguments when needed", async () => {
  if (!(await supportsPackageBridgeFixture())) {
    return;
  }

  const fixture = fileURLToPath(new URL("./fixtures/stdio-mcp-server.mjs", import.meta.url));
  const startedBridges: Array<{ close(): Promise<void> }> = [];
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [
        officialEntry("io.github.cmdforge/weather", "1.1.0", true, {
          packages: [{
            registryType: "npm",
            runtimeHint: "node",
            identifier: fixture,
            runtimeArguments: [{
              type: "named",
              name: "--definitely-not-a-real-node-flag",
            }],
            transport: { type: "stdio" },
          }],
        }),
      ];
    },
    async startPackageBridge(pkg) {
      const bridge = await startPackageBridge(pkg);
      startedBridges.push(bridge);
      return bridge;
    },
  });

  try {
    const connected = await manager.connectOfficialServer({
      name: "io.github.cmdforge/weather",
      target: { type: "package", index: 0 },
    });

    assert.match(connected.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    await assert.doesNotReject(() => pingServer(connected.url));
  } finally {
    await closeAll(startedBridges);
  }
});

test("connectTipServer starts registered package entries as local MCP endpoints", async () => {
  if (!(await supportsPackageBridgeFixture())) {
    return;
  }

  const fixture = fileURLToPath(new URL("./fixtures/stdio-mcp-server.mjs", import.meta.url));
  const startedBridges: Array<{ close(): Promise<void> }> = [];
  const manager = createManagerInstance({
    async loadOfficialServers() {
      return [];
    },
    async startPackageBridge(pkg) {
      const bridge = await startPackageBridge(pkg);
      startedBridges.push(bridge);
      return bridge;
    },
  });

  manager.registerTipServer({
    server: {
      $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: "io.github.cmdforge/tip-fixture",
      description: "fixture",
      version: "0.0.0",
      packages: [{
        registryType: "npm",
        runtimeHint: "node",
        identifier: fixture,
        transport: { type: "stdio" },
      }],
    },
  });

  try {
    const connected = await manager.connectTipServer({
      name: "io.github.cmdforge/tip-fixture",
    });

    assert.match(connected.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    await assert.doesNotReject(() => pingServer(connected.url));
  } finally {
    await closeAll(startedBridges);
  }
});

async function pingServer(url: string) {
  const client = new Client(
    { name: "tip-manager-test", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(url));

  try {
    await client.connect(transport);
    await client.ping();
  } finally {
    await transport.close();
    await client.close();
  }
}

async function closeAll(startedBridges: Array<{ close(): Promise<void> }>) {
  for (const bridge of startedBridges) {
    await bridge.close().catch(() => {});
  }
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

let packageBridgeSupport: Promise<boolean> | undefined;

async function supportsPackageBridgeFixture(): Promise<boolean> {
  packageBridgeSupport ??= (async () => {
    if (!(await supportsTcpListen())) {
      return false;
    }

    const fixture = fileURLToPath(new URL("./fixtures/stdio-mcp-server.mjs", import.meta.url));

    try {
      const bridge = await startPackageBridge({
        registryType: "npm",
        runtimeHint: "node",
        identifier: fixture,
        transport: { type: "stdio" },
      });

      await bridge.close().catch(() => {});
      return true;
    } catch {
      return false;
    }
  })();

  return await packageBridgeSupport;
}

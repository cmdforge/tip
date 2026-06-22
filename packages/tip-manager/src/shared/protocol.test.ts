import assert from "node:assert/strict";
import test from "node:test";
import type { JsonRpcConnectionLike } from "@cmdforge/jsonrpc";
import type { ServerJson } from "./index.js";
import {
  protocol,
  type ConnectServersParams,
  type ListServersParams,
  type OfficialServerConnectParams,
  type OfficialServersReadyParams,
  type TipServerRegisterParams,
} from "./protocol.js";

class FakeConnection implements JsonRpcConnectionLike {
  readonly requests = new Map<string, (...params: unknown[]) => unknown>();
  readonly notifications = new Map<string, (...params: unknown[]) => void>();
  readonly sentRequests: Array<{ method: string; params: unknown[] }> = [];
  readonly sentNotifications: Array<{ method: string; params: unknown[] }> = [];

  async sendRequest<R>(type: { method: string }, ...params: unknown[]): Promise<R> {
    this.sentRequests.push({
      method: type.method,
      params,
    });

    return undefined as R;
  }

  sendNotification(type: { method: string }, ...params: unknown[]): void {
    this.sentNotifications.push({
      method: type.method,
      params,
    });
  }

  onRequest(type: { method: string }, handler: (...params: unknown[]) => unknown): void {
    this.requests.set(type.method, handler);
  }

  onNotification(type: { method: string }, handler: (...params: unknown[]) => void): void {
    this.notifications.set(type.method, handler);
  }
}

const gitprofileServer: ServerJson = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: "io.github.cmdforge/gitprofile",
  description: "Git profile MCP server",
  version: "0.0.0",
};

test("protocol client exposes nested outbound APIs and registers inbound notifications", async () => {
  const connection = new FakeConnection();
  const seenReady: Array<{ count: number; loadedAt: string }> = [];

  const client = protocol.client(connection, (peer) => {
    peer.inbound.notifications.servers.official.ready(
      (params: OfficialServersReadyParams) => {
        seenReady.push(params);
      },
    );
  });

  await client.outbound.requests.servers.list({
    type: "official",
  });
  await client.outbound.requests.servers.connect({
    type: "tip",
    name: gitprofileServer.name,
  });
  await client.outbound.requests.servers.official.list();
  await client.outbound.requests.servers.tip.connect({
    name: gitprofileServer.name,
  });
  await client.outbound.requests.servers.tip.list();
  await client.outbound.requests.tip.register({
    server: gitprofileServer,
  });

  assert.deepEqual(connection.sentRequests, [
    {
      method: "servers/list",
      params: [
        {
          type: "official",
        },
      ],
    },
    {
      method: "servers/connect",
      params: [
        {
          type: "tip",
          name: gitprofileServer.name,
        },
      ],
    },
    {
      method: "servers/official/list",
      params: [],
    },
    {
      method: "servers/tip/connect",
      params: [
        {
          name: gitprofileServer.name,
        },
      ],
    },
    {
      method: "servers/tip/list",
      params: [],
    },
    {
      method: "tip/register",
      params: [
        {
          server: gitprofileServer,
        },
      ],
    },
  ]);

  const readyHandler = connection.notifications.get("servers/official/ready");
  assert.ok(readyHandler);

  readyHandler({
    count: 123,
    loadedAt: "2026-06-18T00:00:00.000Z",
  });

  assert.deepEqual(seenReady, [
    {
      count: 123,
      loadedAt: "2026-06-18T00:00:00.000Z",
    },
  ]);
});

test("protocol server exposes nested outbound APIs and registers inbound requests", async () => {
  const connection = new FakeConnection();

  const server = protocol.server(connection, (peer) => {
    peer.inbound.requests.servers.list(
      async (params: ListServersParams) => {
        if (params.type === "official") {
          return {
            type: "official" as const,
            ready: true as const,
            count: 1,
            loadedAt: "2026-06-18T00:00:00.000Z",
            servers: [],
          };
        }

        return {
          type: "tip" as const,
          servers: [gitprofileServer],
        };
      },
    );

    peer.inbound.requests.servers.connect(
      async (params: ConnectServersParams) => {
        return {
          type: params.type,
          url: `ws://${params.type}/${params.name}`,
        };
      },
    );

    peer.inbound.requests.servers.official.connect(
      async (params: OfficialServerConnectParams) => {
        return {
          url: `ws://official/${params.name}/${params.target.type}/${params.target.index}`,
        };
      },
    );

    peer.inbound.requests.servers.tip.list(() => {
      return {
        servers: [gitprofileServer],
      };
    });

    peer.inbound.requests.tip.register(
      async (params: TipServerRegisterParams) => {
        return {
          name: params.server.name,
        };
      },
    );
  });

  server.outbound.notifications.servers.official.ready({
    count: 2,
    loadedAt: "2026-06-18T00:00:00.000Z",
  });

  assert.deepEqual(connection.sentNotifications, [
    {
      method: "servers/official/ready",
      params: [
        {
          count: 2,
          loadedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    },
  ]);

  const officialConnect = connection.requests.get("servers/official/connect");
  assert.ok(officialConnect);

  const officialConnectResult = await officialConnect({
    name: "io.github.user/weather",
    target: {
      type: "remote",
      index: 1,
    },
  });

  assert.deepEqual(officialConnectResult, {
    url: "ws://official/io.github.user/weather/remote/1",
  });

  const listServers = connection.requests.get("servers/list");
  assert.ok(listServers);

  const listServersResult = await listServers({
    type: "official",
  });

  assert.deepEqual(listServersResult, {
    type: "official",
    ready: true,
    count: 1,
    loadedAt: "2026-06-18T00:00:00.000Z",
    servers: [],
  });

  const connectServers = connection.requests.get("servers/connect");
  assert.ok(connectServers);

  const connectServersResult = await connectServers({
    type: "tip",
    name: gitprofileServer.name,
  });

  assert.deepEqual(connectServersResult, {
    type: "tip",
    url: `ws://tip/${gitprofileServer.name}`,
  });

  const tipList = connection.requests.get("servers/tip/list");
  assert.ok(tipList);
  assert.deepEqual(await tipList(), {
    servers: [gitprofileServer],
  });

  const tipRegister = connection.requests.get("tip/register");
  assert.ok(tipRegister);
  assert.deepEqual(await tipRegister({
    server: gitprofileServer,
  }), {
    name: gitprofileServer.name,
  });
});

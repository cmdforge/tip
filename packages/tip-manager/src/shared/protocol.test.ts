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
            total: 1,
            servers: [],
          };
        }

        return {
          type: "tip" as const,
          total: 1,
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

  const officialConnect = connection.requests.get("servers/connect");
  assert.ok(officialConnect);

  const officialConnectResult = await officialConnect({
    type: "official",
    name: "io.github.user/weather",
    target: {
      type: "remote",
      index: 1,
    },
  });

  assert.deepEqual(officialConnectResult, {
    type: "official",
    url: "ws://official/io.github.user/weather",
  });

  const listServers = connection.requests.get("servers/list");
  assert.ok(listServers);

  const listServersResult = await listServers({
    type: "official",
  });

  assert.deepEqual(listServersResult, {
    type: "official",
    total: 1,
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

  assert.deepEqual(await listServers({
    type: "tip",
  }), {
    type: "tip",
    total: 1,
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

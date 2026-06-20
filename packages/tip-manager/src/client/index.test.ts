import assert from "node:assert/strict";
import test from "node:test";
import type {
  ClientFactory,
} from "@cmdforge/jsonrpc/client";
import type {
  ProtocolDefinition,
  ProtocolPeer,
} from "@cmdforge/jsonrpc";
import {
  connectServer,
} from "./index.js";
import type {
  ConnectServersParams,
  ManagerProtocol,
  TipServerConnectParams,
} from "../shared/protocol.js";

test("connectServer requests a manager connection and opens the returned websocket url", async () => {
  const params: ConnectServersParams = {
    type: "official",
    name: "io.github.user.weather",
    target: {
      type: "remote",
      index: 0,
    },
  };
  const seenUrls: string[] = [];
  const downstreamPeer = {
    outbound: {
      requests: {},
      notifications: {},
    },
    inbound: {
      requests: {},
      notifications: {},
    },
    connection: {},
    protocol: {},
  } as ProtocolPeer<ProtocolDefinition, "client">;

  const managerPeer = {
    outbound: {
      requests: {
        servers: {
          connect: async (received: ConnectServersParams) => {
            assert.deepEqual(received, params);

            return {
              type: "official" as const,
              url: "ws://127.0.0.1:4040/",
            };
          },
        },
      },
    },
  } as ProtocolPeer<ManagerProtocol, "client">;

  const downstreamClientFactory = {
    protocol: {} as never,
    initialize: undefined,
    async connectWebSocket(url: string) {
      seenUrls.push(url);
      return downstreamPeer;
    },
  } satisfies ClientFactory<ProtocolDefinition>;

  const connected = await connectServer(
    managerPeer,
    params,
    downstreamClientFactory,
  );

  assert.deepEqual(seenUrls, [
    "ws://127.0.0.1:4040/",
  ]);
  assert.equal(connected.type, "official");
  assert.equal(connected.url, "ws://127.0.0.1:4040/");
  assert.equal(connected.peer, downstreamPeer);
});

test("connectServer supports tip-managed registrations", async () => {
  const params: TipServerConnectParams = {
    name: "gitprofile",
  };
  const seenUrls: string[] = [];
  const downstreamPeer = {
    outbound: {
      requests: {},
      notifications: {},
    },
    inbound: {
      requests: {},
      notifications: {},
    },
    connection: {},
    protocol: {},
  } as ProtocolPeer<ProtocolDefinition, "client">;

  const managerPeer = {
    outbound: {
      requests: {
        servers: {
          connect: async (received: ConnectServersParams) => {
            assert.deepEqual(received, {
              type: "tip",
              ...params,
            });

            return {
              type: "tip" as const,
              url: "ws://127.0.0.1:5050/",
            };
          },
        },
      },
    },
  } as ProtocolPeer<ManagerProtocol, "client">;

  const downstreamClientFactory = {
    protocol: {} as never,
    initialize: undefined,
    async connectWebSocket(url: string) {
      seenUrls.push(url);
      return downstreamPeer;
    },
  } satisfies ClientFactory<ProtocolDefinition>;

  const connected = await connectServer(
    managerPeer,
    {
      type: "tip",
      ...params,
    },
    downstreamClientFactory,
  );

  assert.deepEqual(seenUrls, [
    "ws://127.0.0.1:5050/",
  ]);
  assert.equal(connected.type, "tip");
  assert.equal(connected.url, "ws://127.0.0.1:5050/");
});

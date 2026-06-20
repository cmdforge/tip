import assert from "node:assert/strict";
import test from "node:test";
import type { JsonRpcConnectionLike } from "./index.js";
import { createProtocol } from "./index.js";

class FakeConnection implements JsonRpcConnectionLike {
  readonly requests = new Map<string, (...params: unknown[]) => unknown>();
  readonly notifications = new Map<string, (...params: unknown[]) => void>();

  async sendRequest<R>(_type: { method: string }, ..._params: unknown[]): Promise<R> {
    return undefined as R;
  }

  sendNotification(_type: { method: string }, ..._params: unknown[]): void {}

  onRequest(type: { method: string }, handler: (...params: unknown[]) => unknown): void {
    this.requests.set(type.method, handler);
  }

  onNotification(type: { method: string }, handler: (...params: unknown[]) => void): void {
    this.notifications.set(type.method, handler);
  }
}

test("protocol trees do not collide when different directions reuse the same record key", () => {
  const protocol = createProtocol(({ request }) => ({
    clientToServer: {
      requests: {
        tip: request("tip/register")<{ name: string }, { ok: true }>(),
      },
    },
    serverToClient: {
      requests: {
        tip: request("tip/connect")<void, { url: string }>(),
      },
    },
    bidirectional: {},
  }));

  const client = protocol.client(new FakeConnection());
  const server = protocol.server(new FakeConnection());

  assert.equal(typeof client.outbound.requests.tip.register, "function");
  assert.equal(typeof client.inbound.requests.tip.connect, "function");
  assert.equal(typeof server.outbound.requests.tip.connect, "function");
  assert.equal(typeof server.inbound.requests.tip.register, "function");
});

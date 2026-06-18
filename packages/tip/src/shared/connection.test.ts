import assert from "node:assert/strict";
import test from "node:test";
import { getTipTransportForUrl } from "./connection.js";

test("resolves streamable http transport from http urls", () => {
  assert.equal(
    getTipTransportForUrl("http://127.0.0.1:4312/mcp"),
    "streamable-http",
  );
  assert.equal(
    getTipTransportForUrl("https://example.com/mcp"),
    "streamable-http",
  );
});

test("resolves websocket transport from ws urls", () => {
  assert.equal(
    getTipTransportForUrl("ws://127.0.0.1:4312/mcp"),
    "websocket",
  );
  assert.equal(
    getTipTransportForUrl("wss://example.com/mcp"),
    "websocket",
  );
});

test("rejects unsupported urls", () => {
  assert.throws(
    () => getTipTransportForUrl("file:///tmp/server"),
    /Unsupported TIP server URL protocol/,
  );
});

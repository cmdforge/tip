import assert from "node:assert/strict";
import test from "node:test";
import {
  createTipUiOpenCommand,
  resolveTipConnection,
} from "./ui.js";

test("createTipUiOpenCommand uses the default pnpm dlx launch shape", () => {
  assert.deepEqual(
    createTipUiOpenCommand({ url: "http://127.0.0.1:4312/mcp" }),
    {
      command: "pnpm",
      args: [
        "dlx",
        "github:cmdforge/tip",
        "ui",
        "open",
        "http://127.0.0.1:4312/mcp",
      ],
    },
  );
});

test("resolveTipConnection passes through direct urls", async () => {
  const connection = await resolveTipConnection({
    type: "url",
    url: "ws://127.0.0.1:4312/mcp",
  });

  assert.equal(connection.url, "ws://127.0.0.1:4312/mcp");
  assert.equal(connection.transport, "websocket");

  await assert.doesNotReject(() => connection.close());
});

test("resolveTipConnection keeps stdio normalization server-only for now", async () => {
  await assert.rejects(
    () =>
      resolveTipConnection({
        type: "stdio",
        command: "gitprofile",
        args: ["mcp"],
      }),
    /stdio TIP connection bridging is not implemented yet/,
  );
});

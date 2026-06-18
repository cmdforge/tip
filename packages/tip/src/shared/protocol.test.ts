import test from "node:test";
import assert from "node:assert/strict";
import { createProtocol } from "./protocol.js";

const protocol = createProtocol(({ tool, z }) => ({
  ping: tool(),

  createUser: tool(
    z.object({
      email: z.string(),
      name: z.string(),
    }),
    z.object({
      id: z.string(),
    })
  ),
}));

const handler = protocol.handler({
  async ping() {
    return;
  },

  async createUser(_input) {
    return {
      id: "123",
    };
  },
});

test("protocol.handler attaches protocol metadata", async () => {
  assert.equal(handler.$protocol, protocol);
  await assert.doesNotReject(() => handler.ping({}));
  await assert.doesNotReject(() =>
    handler.createUser({ email: "a@example.com", name: "A" }),
  );
});

test("tool definitions keep input and output schemas", () => {
  const parsed = protocol.tools.createUser.inputSchema.parse({
    email: "a@example.com",
    name: "A",
  });

  const output = protocol.tools.createUser.outputSchema?.parse({ id: "123" });

  assert.deepEqual(parsed, { email: "a@example.com", name: "A" });
  assert.deepEqual(output, { id: "123" });
});

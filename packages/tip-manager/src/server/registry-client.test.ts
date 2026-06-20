import assert from "node:assert/strict";
import test from "node:test";
import { createRegistryClient } from "./registry-client.js";

test("registry client matches the generated servers contract", async () => {
  let requestedUrl = "";
  let requestedMethod = "";

  const client = createRegistryClient(async (input, init) => {
    requestedUrl = getRequestUrl(input);
    requestedMethod =
      init?.method ??
      getRequestMethod(input) ??
      "GET";

    return new Response(
      JSON.stringify({
        metadata: {
          count: 1,
          nextCursor: "next-page",
        },
        servers: [
          {
            server: {
              $schema: "https://example.com/server.schema.json",
              name: "io.github.user/weather",
              description: "Weather tools",
              version: "1.0.0",
              title: "Weather",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://example.com/mcp",
                },
              ],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                statusChangedAt: "2026-06-19T00:00:00.000Z",
                publishedAt: "2026-06-19T00:00:00.000Z",
                updatedAt: "2026-06-19T00:00:00.000Z",
                isLatest: true,
              },
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  });

  const { data, error } = await client.GET("/v0.1/servers", {
    params: {
      query: {
        limit: 100,
        cursor: "cursor-1",
        include_deleted: true,
      },
    },
  });

  assert.equal(error, undefined);
  assert.ok(data);
  assert.equal(requestedMethod, "GET");
  assert.match(requestedUrl, /^https:\/\/registry\.modelcontextprotocol\.io\/v0\.1\/servers\?/);
  assert.match(requestedUrl, /limit=100/);
  assert.match(requestedUrl, /cursor=cursor-1/);
  assert.match(requestedUrl, /include_deleted=true/);

  assert.equal(data.metadata.count, 1);
  assert.equal(data.metadata.nextCursor, "next-page");
  assert.equal(data.servers?.[0]?.server.name, "io.github.user/weather");
  assert.equal(data.servers?.[0]?.server.version, "1.0.0");
  assert.equal(
    data.servers?.[0]?._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest,
    true,
  );
  assert.equal(
    data.servers?.[0]?.server.remotes?.[0]?.type,
    "streamable-http",
  );
});

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function getRequestMethod(input: RequestInfo | URL) {
  if (typeof input === "string" || input instanceof URL) {
    return undefined;
  }

  return input.method;
}

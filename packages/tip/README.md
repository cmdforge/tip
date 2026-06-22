# @cmdforge/tip

Shared TIP library code.

This package is the main place for:

- defining protocol shapes once
- creating typed handlers for those tools
- exposing those tools through MCP
- consuming those tools through MCP clients
- describing MCP server entries with shared registry-compatible types
- starting TIP-backed MCP servers from server-side code

Repository overview lives in the [root README](/Users/yakisoba/Documents/GitHub/tip/README.md).

## Exports

### `@cmdforge/tip`

Shared types and helpers that are safe for both client and server code.

Notable exports include:

- protocol builders and protocol-derived types
- connection helpers such as `getTipTransportForUrl(...)`

### `@cmdforge/tip/client`

Client-side helpers for invoking TIP-defined tools.

Notable exports include:

- `createMcpHandler(...)`
- `createAppHandler(...)`

### `@cmdforge/tip/server`

Server-side helpers for exposing TIP-defined tools and UI.

Notable exports include:

- `registerTools(...)`
- `registerAppUI(...)`
- `startTipServer(...)`

## Common pieces

### Define tools once

```ts
import { createProtocol } from "@cmdforge/tip";

const counter = createProtocol(({ tool, z }) => ({
  increment: tool(
    z.object({ value: z.number() }),
    z.object({ result: z.number() }),
  ),
}));

const handler = counter.handler({
  async increment({ value }) {
    return { result: value + 1 };
  },
});
```

### Expose them as MCP tools

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "@cmdforge/tip/server";

const server = new McpServer({
  name: "example",
  version: "0.0.0",
});

registerTools(server, handler);
```

### Call them through MCP

```ts
import { createMcpHandler } from "@cmdforge/tip/client";

const client = createMcpHandler(mcpClient, counter);
const result = await client.increment({ value: 1 });
```

## TIP server startup

`startTipServer(...)` is the runtime helper for the actual MCP server process.

It:

- creates an MCP server
- registers translated tools onto it
- optionally registers an app UI resource
- exposes the result over streamable HTTP

This is intended to back a third-party CLI command such as `my-cli mcp`.

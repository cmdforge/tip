# TIP

Tool Interface Protocol (TIP) is a small set of helpers for defining tool contracts once and then reusing them across MCP servers, MCP clients, and a desktop UI shell.

The repo currently has a few main parts:

- [`packages/tip`](/Users/yakisoba/Documents/GitHub/tip/packages/tip): protocol types and MCP/TIP helpers
- [`apps/tip-ui`](/Users/yakisoba/Documents/GitHub/tip/apps/tip-ui): an Electron shell for browsing and rendering MCP tools
- [`packages/jsonrpc`](/Users/yakisoba/Documents/GitHub/tip/packages/jsonrpc): lower-level JSON-RPC transport pieces
- [`packages/tip-manager`](/Users/yakisoba/Documents/GitHub/tip/packages/tip-manager): TIP server management helpers and CLI

## What exists now

In `packages/tip`:

- `createProtocol(...)` defines tools with input/output schemas
- `protocol.handler(...)` creates a typed handler for those tools
- `registerTools(...)` exposes a handler as MCP tools
- `createMcpHandler(...)` calls those tools through an MCP client
- `createAppHandler(...)` calls those tools through an MCP Apps app context
- `registerAppUI(...)` exposes a UI resource/tool pairing
- `resolveTipConnection(...)` normalizes a server-side connection source into a connectable URL
- `openTipUi(...)` opens the TIP UI shell against a URL

In `apps/tip-ui`:

- connect to an MCP server by URL
- choose streamable HTTP vs WebSocket from the URL scheme
- load the available tool list
- prefer the TIP UI tool if it exists, otherwise select the first tool
- inspect the full server tool list as JSON
- inspect the currently selected tool as JSON
- render a tool's custom UI through `AppRenderer` when the tool exposes a UI resource
- always provide a generic generated form for the tool input schema

## Protocol example

```ts
import { createProtocol } from "@cmdforge/tip/shared";
import { createMcpHandler } from "@cmdforge/tip/client";
import { registerTools } from "@cmdforge/tip/server";

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

registerTools(server, handler);

const client = createMcpHandler(mcpClient, counter);

const result = await client.increment({ value: 1 });
```

## UI shell

The repo root exposes a forwarding CLI for opening the shell from the monorepo:

```bash
pnpm dlx github:cmdforge/tip ui open <server-url>
```

There is also a local workspace shortcut for the current test server:

```bash
pnpm ui-local
```

The shell currently assumes it is given a connectable MCP server URL. It does not yet start local MCP servers by itself.

## Current tip-ui layout

The shell UI is intentionally simple:

- server URL row with `Go` and `Info`
- tool dropdown row with `Info`
- two full-width tabs: `UI` and `Form`
- selected tab content takes the rest of the page

The `UI` tab is disabled when the selected tool does not expose a UI resource. The `Form` tab is always available.

## Notes

The repo is still early and the shape may change.

Likely next steps:

- generate protocol definitions from existing local or remote MCP servers
- optionally let `tip-ui` start local servers instead of only connecting to URLs
- maybe add a more formal invocation history view for tool input/output

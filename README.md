# TIP

Tool Interface Protocol (TIP) offers a simplified path to taking bits of functionality, exposing them as MCP tools, and invoking them through an MCP Apps UI shell.

The current idea is to define request and response shapes once, then reuse that definition across different runtimes:

- A local handler that implements the functionality
- An MCP server that registers the functionality as tools
- An MCP client that invokes those tools like a typed API
- An MCP Apps UI that calls the same tools through the same protocol shape

This makes it possible to build UI around tool-based functionality without maintaining a completely separate integration path for the UI.

## What it does

TIP currently provides:

- A single definition of tool inputs and outputs
- A typed handler interface for implementing functionality
- A consistent way to invoke that functionality from CLI, MCP, or UI layers
- A simple bridge between MCP tools and app-style interfaces

In practice, this treats MCP tools more like a small typed API surface with shared contracts and reusable clients.

## Flow

At a high level:

1. Define a protocol with tool names and input/output schemas.
2. Implement a handler for that protocol.
3. Register that handler as MCP tools on a server.
4. Create clients that call those tools from MCP or from an MCP Apps UI.

The protocol definition is the shared contract between those pieces.

## Example

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

## Repository pieces

- [`packages/tip`](/Users/yakisoba/Documents/GitHub/tip/packages/tip) contains the protocol types and adapters
- [`apps/tip-ui`](/Users/yakisoba/Documents/GitHub/tip/apps/tip-ui) is the Tauri-based MCP Apps UI shell

Current building blocks:

- `createProtocol(...)` for defining tools and schemas
- `protocol.handler(...)` for creating a typed implementation
- `registerTools(...)` for exposing a handler as MCP tools
- `createMcpHandler(...)` for calling tools through an MCP client
- `createAppHandler(...)` for calling tools through an MCP Apps app context
- `registerAppUI(...)` for exposing a UI resource/tool pairing
- `resolveTipConnection(...)` for normalizing a server-side connection source into a connectable URL
- `openTipUi(...)` for opening the TIP UI shell against a URL

## UI shell

The repo root exposes a small forwarding CLI so the UI shell can be opened from the GitHub repo with a single command:

```bash
pnpm dlx github:cmdforge/tip ui open <server-url>
```

The shell itself is in [`apps/tip-ui`](/Users/yakisoba/Documents/GitHub/tip/apps/tip-ui) and currently accepts a server URL. The intention is that TIP UI always receives a connectable URL and decides internally whether to use streamable HTTP or WebSocket based on the URL scheme.

## Notes

The repo is still early and the shape may change.

One likely next step is generating protocol definitions automatically from existing local or remote MCP servers. For example, that could mean:

- reading a server's tool definitions
- serializing the returned tool metadata into a TypeScript file
- importing that generated file into a UI builder

That would make it easier to build UI for an MCP server without hand-writing the protocol definition first.

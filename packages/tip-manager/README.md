# tip-manager

JSON-RPC protocol and transport helpers for talking to an MCP manager over WebSockets.

This project is still in-progress, but it already has a shared typed protocol layer, client/server peer wrappers, WebSocket transport helpers, and a bootstrap CLI command for starting a single-session manager transport.

## Current shape

- `src/shared`
  Shared protocol definitions and JSON-RPC utilities.
- `src/client`
  Client-side factories and transport helpers.
- `src/server`
  Server-side factories and transport helpers.
- `src/bin/manage.ts`
  Bootstrap command that starts a one-session WebSocket endpoint, prints its URL, waits for a handshake pong, and then lives for the lifetime of that socket.

The eventual goal is still an MCP manager that:

- tracks official registry entries separately from local `mcp.json` entries
- starts MCP servers when needed
- normalizes access so consumers always connect over WebSockets
- exposes a typed JSON-RPC control plane for apps like CLIs, Electron/Tauri apps, and browser clients

## Shared protocol

Protocols are defined in `src/shared/protocol.ts` using a small builder around `vscode-jsonrpc`.

Current manager methods:

- `servers/official/list`
- `servers/official/connect`
- `servers/official/ready`
- `servers/mcpjson/list`
- `servers/mcpjson/add`
- `servers/mcpjson/remove`
- `servers/mcpjson/connect`
- `servers/mcpjson/listChanged`

The shared JSON-RPC helper in `src/shared/jsonrpc.ts` builds a typed peer API from those method strings.

## Peer model

Binding a protocol to a connection returns a `ProtocolPeer`.

The peer exposes:

- `peer.outbound.requests...`
- `peer.outbound.notifications...`
- `peer.inbound.requests...(handler)`
- `peer.inbound.notifications...(handler)`
- `peer.connection`
- `peer.protocol`

So outbound calls are senders, and inbound calls are registrars.

Example:

```ts
import { protocol } from "@cmdforge/tip-manager";

const peer = protocol.server(connection, (peer) => {
  peer.inbound.requests.servers.official.connect(async (params) => {
    peer.outbound.notifications.servers.official.ready({
      count: 1,
      loadedAt: new Date().toISOString(),
    });

    return {
      url: `ws://example/${params.name}`,
    };
  });
});
```

## Client factory

Use `createClient(protocol, initialize?)` to bind a protocol and optional initializer once, then connect it over transports later.

```ts
import { createClient } from "@cmdforge/tip-manager/client";
import { protocol } from "@cmdforge/tip-manager";

const client = createClient(protocol, (peer) => {
  peer.inbound.notifications.servers.official.ready((params) => {
    console.log(params.count, params.loadedAt);
  });
});

const peer = await client.connectWebSocket("ws://127.0.0.1:3000/");
```

Right now the first transport helper is:

- `connectWebSocket(url, options?)`

## Server factory

Use `createServer(protocol, initialize?)` to bind server-side behavior once.

```ts
import { createServer } from "@cmdforge/tip-manager/server";
import { protocol } from "@cmdforge/tip-manager";

const server = createServer(protocol, (peer) => {
  peer.inbound.requests.servers.mcpjson.list(() => ({
    servers: [],
  }));
});
```

Current server-side helpers:

- `acceptWebSocket(webSocket, options?)`
- `startWebSocket(options?)`

`acceptWebSocket(...)` binds one already-accepted WebSocket into a peer.

`startWebSocket(...)` currently behaves as a single-session rendezvous:

- starts a WebSocket server
- returns its URL immediately
- accepts the first incoming socket
- binds that socket into a peer
- rejects additional clients
- exposes `peer` and `closed` promises for the session lifetime

Example:

```ts
const server = createServer(protocol);
const started = await server.startWebSocket({
  host: "127.0.0.1",
  port: 0,
  path: "/",
});

console.log(started.url);

const peer = await started.peer;
await started.closed;
```

## Bootstrap command

The package currently exposes a `manage` bin:

```sh
npx -y @cmdforge/tip-manager manage
```

That command:

1. starts a single-session WebSocket server on `127.0.0.1` with a random port
2. prints a bootstrap message to stdout:

```json
{"type":"websocket-url","url":"ws://127.0.0.1:12345/"}
```

3. waits for a pong on stdin
4. then keeps running for the lifetime of the accepted socket session

The pong can currently be either:

- `pong`
- `{"type":"pong"}`

This handshake is intentionally separate from the manager JSON-RPC protocol itself. It is just the bootstrap phase used to learn the WebSocket URL for the newly started manager process.

## Development

```sh
npm install
npm run build
npm test
```

Current tests cover:

- cached registry loading
- protocol outbound nesting
- protocol inbound registration
- client/server direction wiring

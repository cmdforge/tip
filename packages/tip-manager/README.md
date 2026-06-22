# @cmdforge/tip-manager

TIP manager daemon and manager protocol.

This package is responsible for:

- exposing the manager JSON-RPC protocol over WebSockets
- keeping a live in-memory set of TIP server registrations
- listing official registry entries
- returning connection information for official and TIP-managed servers
- owning the generated registry schema types used by manager

## Exports

### `@cmdforge/tip-manager`

Shared manager protocol definitions.

### `@cmdforge/tip-manager/client`

Manager client helpers for connecting to a manager WebSocket and then connecting through it to another server.

### `@cmdforge/tip-manager/server`

Manager server helpers, daemon lifecycle helpers, registration conveniences, registry client helpers, and the manager daemon server factory.

## Manager protocol

Current request surface:

- `servers/list`
- `servers/connect`
- `servers/official/list`
- `servers/official/connect`
- `servers/tip/list`
- `servers/tip/connect`
- `tip/register`

Current notification surface:

- `servers/official/ready`
- `servers/tip/listChanged`

See the more explicit protocol summary in [doc/schema.md](/Users/yakisoba/Documents/GitHub/tip/packages/tip-manager/doc/schema.md).

## Daemon

The package bin is:

```bash
npx -y @cmdforge/tip-manager
```

That starts the manager daemon. The daemon listens on `127.0.0.1` with an ephemeral port and reports `{ pid, url }` back to the spawning process over Node IPC.

The daemon owns its own singleton state. On startup it checks for an already-running manager, reuses that `{ pid, url }` if one exists, and only binds a new websocket listener when it successfully becomes the singleton instance.

In normal usage you do not call the daemon directly. Use `ensureManagerRunning()` or `connectToManager()` from `@cmdforge/tip-manager/server` when you want to interact with the manager from Node code.

## Official vs TIP servers

The manager currently understands two categories:

- `official`
  Registry-backed entries fetched from the MCP registry.
- `tip`
  Locally registered `ServerJson` entries. These can describe a remote MCP server directly, or they can carry package entries that the manager may later launch.

At the moment, direct remote tip entries can connect immediately. Package-based startup is recognized, but actual process bridging through manager is still not implemented.

## Development

```bash
pnpm --dir packages/tip-manager generate
pnpm --dir packages/tip-manager build
pnpm --dir packages/tip-manager test
```

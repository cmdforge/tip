# @cmdforge/tip-manager

TIP manager daemon and manager protocol.

This package is responsible for:

- exposing the manager JSON-RPC protocol over WebSockets
- keeping a live in-memory set of TIP server registrations
- listing official registry entries
- returning connection information for official and TIP-managed servers

Shared TIP types and registration helpers live in [`@cmdforge/tip`](/Users/yakisoba/Documents/GitHub/tip/packages/tip/README.md).

## Exports

### `@cmdforge/tip-manager`

Shared manager protocol definitions.

### `@cmdforge/tip-manager/client`

Manager client helpers for connecting to a manager WebSocket and then connecting through it to another server.

### `@cmdforge/tip-manager/server`

Manager server helpers, registry client helpers, and the manager daemon server factory.

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

In normal usage you do not call the daemon directly. `@cmdforge/tip/server` handles manager startup through `utils.ensureManagerStarted()`.

## Official vs TIP servers

The manager currently understands two categories:

- `official`
  Registry-backed entries fetched from the MCP registry.
- `tip`
  Locally registered `ServerJson` entries. These can describe a remote MCP server directly, or they can carry TIP startup metadata for a command that should later be launched by the manager.

At the moment, direct remote tip entries can connect immediately. Command-based tip startup metadata is parsed and stored, but actual process startup through manager is still not implemented.

## Development

```bash
pnpm --dir packages/tip-manager build
pnpm --dir packages/tip-manager test
```

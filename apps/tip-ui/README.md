# @cmdforge/tip-ui

Electron shell for connecting to an MCP server and rendering its tools.

This app is intentionally small. It is meant to be a host shell for:

- browsing a server's tool list
- preferring a custom MCP Apps UI resource when one exists
- falling back to a generated form when a tool only exposes JSON Schema

Shared library details live in [`@cmdforge/tip`](/Users/yakisoba/Documents/GitHub/tip/packages/tip/README.md).

## Current behavior

The shell currently:

- accepts a server URL
- chooses WebSocket vs streamable HTTP from the URL scheme
- loads the server tool list
- prefers the TIP UI tool if it exists, otherwise selects the first tool
- shows a tool info modal with pretty-printed JSON
- shows a server info modal with the full tool list JSON
- renders two tabs for the selected tool:
  - `UI`
  - `Form`

The `UI` tab is disabled when the selected tool does not expose a UI resource. The `Form` tab is always available.

## CLI

The package exposes:

```bash
tip-ui open <server-url>
```

From this monorepo, the root forwards that through the `ui` bin:

```bash
pnpm dlx github:cmdforge/tip ui open <server-url>
```

## Development

```bash
pnpm --dir apps/tip-ui dev
```

For typechecking and build output:

```bash
pnpm --dir apps/tip-ui typecheck
pnpm --dir apps/tip-ui build
```

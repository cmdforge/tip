# TIP

Tool Interface Protocol (TIP) is a monorepo for defining tool contracts once, exposing them through MCP, and building a small UI shell around those tools.

## Packages

- [`packages/tip`](/Users/yakisoba/Documents/GitHub/tip/packages/tip/README.md)
  Shared protocol helpers, MCP helpers, server entry types, and server-side registration/startup utilities.
- [`packages/tip-manager`](/Users/yakisoba/Documents/GitHub/tip/packages/tip-manager/README.md)
  The TIP manager daemon, manager JSON-RPC protocol, and registry-backed server listing logic.
- [`apps/tip-ui`](/Users/yakisoba/Documents/GitHub/tip/apps/tip-ui/README.md)
  The Electron shell for connecting to an MCP server, inspecting its tools, and rendering either a custom MCP Apps UI resource or a generated form.

## Workspace notes

- The root `ui` bin forwards to the `tip-ui` package command.
- `packages/tip` owns the shared generated registry schema types.
- `packages/tip-manager` uses those shared types, but keeps the live registry API client locally.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

For package-specific details, use the package READMEs above rather than this root file.

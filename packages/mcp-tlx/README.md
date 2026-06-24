# `@cmdforge/mcp-tlx`

Generate Cmdforge MCP metadata for MCP servers.

The generator has two modes:

- generate mode: connects to one target MCP server, calls `listTools()`, writes the workspace-level `.cmdforge/mcp` tree, and stores that server config in `package.json`
- install mode: reads `package.json["@cmdforge/mcp"]` and syncs `.cmdforge/mcp` so it matches those saved server definitions

## Output Layout

The generator writes to:

```text
{workspaceRoot}/.cmdforge/mcp/
```

Where `workspaceRoot` is:

- the monorepo root when one can be detected
- otherwise the current working directory

Per generated server, it writes:

```text
.cmdforge/mcp/
  factory.mjs
  call_tool.mjs
  call_tool.md
  package.json
  {safeServerName}/
    client.mjs
    server.json
    tools/
      {safeToolName}.md
```

## Tool Files

Each tool is serialized to:

```text
.cmdforge/mcp/{safeServerName}/tools/{safeToolName}.md
```

with content shaped like:

````md
# {safeToolName}

```json
{serializedTool}
```
````

## Central Files

### `factory.mjs`

Exports the shared MCP client factory used by each generated server client.

### `call_tool.mjs`

Exports and executes a centralized `callTool({ server, tool_call })` helper.

The `server` input is the short server reference name generated with `--name`. It is normalized into the server's safe directory name before lookup. The `tool_call` input matches MCP `tools/call` params shape.

### `call_tool.md`

Rewritten after each generation run. It lists available generated servers and includes the JSON schema for invoking `call_tool`.

## Workspace package.json

Saved MCP server definitions live in the workspace root `package.json` under:

```json
{
  "@cmdforge/mcp": {
    "mantine": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mantine/mcp-server"],
      "env": {}
    }
  }
}
```

Each key is the short server reference name you later pass as `server` to `call_tool`.

## CLI

```text
Usage: mcp-tlx [action] [options]

Options:
  install                Sync from package.json["@cmdforge/mcp"]
  -n, --name <name>     Short server reference name
  --transport <type>    MCP transport: stdio, http, sse, or ws
  --command <command>   Server command for stdio transports
  --arg <value>         Repeatable stdio argument
  --env <key=value>     Repeatable stdio environment variable
  --cwd <path>          Working directory for stdio transports
  --url <url>           Remote MCP URL for http, sse, or ws transports
  --header <key=value>  Repeatable HTTP/SSE header
  -f, --force           Overwrite the generated server directory if it already exists
```

## Examples

### Stdio

```bash
node dist/cli.js \
  --name mantine \
  --transport stdio \
  --command npx \
  --arg -y \
  --arg @mantine/mcp-server
```

### Streamable HTTP

```bash
node dist/cli.js \
  --name remote \
  --transport http \
  --url https://example.com/mcp
```

### Install

```bash
node dist/cli.js install
```

## Notes

- Remote HTTP and SSE generation logs failed response status, headers, and response body text when available.
- The generator runs `npm install` in `.cmdforge/mcp` after writing files.
- `--name` should be the short reference name you will later pass as `server` to `call_tool`.
- `install` does not accept any other CLI arguments.
- Server names and tool names are normalized into safe directory and file names for generated artifacts.

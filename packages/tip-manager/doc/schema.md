# tip-manager JSON-RPC Schema

## Transport

- protocol: JSON-RPC 2.0
- intended transport: WebSocket

## Requests

### `servers/list`

Request params:

```ts
type ListServersParams =
  | ({
      type: "official";
    } & OfficialServersListParams)
  | {
      type: "mcpjson";
    };
```

Response result:

```ts
type ListServersResult =
  | ({
      type: "official";
    } & OfficialServersListResult)
  | ({
      type: "mcpjson";
    } & McpJsonServersListResult);
```

### `servers/connect`

Request params:

```ts
type ConnectServersParams =
  | ({
      type: "official";
    } & OfficialServerConnectParams)
  | ({
      type: "mcpjson";
    } & McpJsonServerConnectParams);
```

Response result:

```ts
type ConnectServersResult =
  | {
      type: "official";
      url: string;
    }
  | {
      type: "mcpjson";
      url: string;
    };
```

### `servers/official/list`

Request params:

```json
null
```

Response result:

```ts
type OfficialServersListResult =
  | {
      ready: false;
    }
  | {
      ready: true;
      count: number;
      loadedAt: string;
      servers: ServerResponse[];
    };
```

### `servers/official/connect`

Request params:

```ts
type OfficialServerConnectParams = {
  name: string;
  target:
    | {
        type: "remote";
        index: number;
      }
    | {
        type: "package";
        index: number;
      };
};
```

Response result:

```ts
type ConnectServerResult = {
  url: string;
};
```

### `servers/mcpjson/list`

Request params:

```json
null
```

Response result:

```ts
type McpJsonServersListResult = {
  servers: ServerJson[];
};
```

### `servers/mcpjson/add`

Request params:

```ts
type AddMcpJsonServerParams = {
  server: ServerJson;
};
```

Response result:

```ts
type McpJsonServersListResult = {
  servers: ServerJson[];
};
```

### `servers/mcpjson/remove`

Request params:

```ts
type RemoveMcpJsonServerParams = {
  name: string;
};
```

Response result:

```ts
type McpJsonServersListResult = {
  servers: ServerJson[];
};
```

### `servers/mcpjson/connect`

Request params:

```ts
type McpJsonServerConnectParams = {
  name: string;
};
```

Response result:

```ts
type ConnectServerResult = {
  url: string;
};
```

## Notifications

### `servers/official/ready`

Notification params:

```ts
type OfficialServersReadyParams = {
  count: number;
  loadedAt: string;
};
```

### `servers/mcpjson/listChanged`

Notification params:

```ts
type McpJsonServersChangedParams = {
  servers: ServerJson[];
};
```

## Notes

- `ServerJson` and `ServerResponse` come from the generated registry/OpenAPI types in `src/shared/registry`.
- `ConnectServerResult.url` is intended to be a WebSocket URL.

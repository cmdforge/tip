# tip-manager JSON-RPC Schema

This file is a human-readable summary of the current manager protocol in [src/shared/protocol.ts](/Users/yakisoba/Documents/GitHub/tip/packages/tip-manager/src/shared/protocol.ts).

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
      type: "tip";
    };
```

Response result:

```ts
type ListServersResult =
  | ({
      type: "official";
    } & OfficialServersListResult)
  | ({
      type: "tip";
    } & TipServersListResult);
```

### `servers/connect`

Request params:

```ts
type ConnectServersParams =
  | ({
      type: "official";
    } & OfficialServerConnectParams)
  | ({
      type: "tip";
    } & TipServerConnectParams);
```

Response result:

```ts
type ConnectServersResult =
  | {
      type: "official";
      url: string;
    }
  | {
      type: "tip";
      url: string;
    };
```

### `servers/official/list`

Request params:

```ts
type OfficialServersListParams = {
  category?: string;
  cursor?: string;
  search?: string;
};
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
      nextCursor?: string;
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

### `servers/tip/list`

Request params:

```json
null
```

Response result:

```ts
type TipServersListResult = {
  servers: ServerJson[];
};
```

### `servers/tip/connect`

Request params:

```ts
type TipServerConnectParams = {
  name: string;
};
```

Response result:

```ts
type ConnectServerResult = {
  url: string;
};
```

### `tip/register`

Request params:

```ts
type TipServerRegisterParams = {
  server: ServerJson;
};
```

Response result:

```ts
type TipServerRegisterResult = {
  name: string;
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

### `servers/tip/listChanged`

Notification params:

```ts
type TipServersChangedParams = {
  servers: ServerJson[];
};
```

## Notes

- `ServerJson`, `ServerResponse`, `ServerListResponse`, and registry OpenAPI `paths` are shared from [`@cmdforge/tip`](/Users/yakisoba/Documents/GitHub/tip/packages/tip/README.md).
- `ConnectServerResult.url` is the connectable MCP endpoint returned by manager.
- TIP registrations currently store full `ServerJson` entries. Those entries may describe either:
  - a directly connectable remote MCP server
  - a TIP-managed server with startup metadata in `_meta`

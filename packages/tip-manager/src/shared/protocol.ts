import type {
  ServerJson,
  ServerResponse,
} from "./registry/index.js";
import {
  createProtocol,
} from "@cmdforge/jsonrpc";
import type { ProtocolInstance } from "@cmdforge/jsonrpc";

export type ServerType = "official" | "mcpjson" | "tip";

export type OfficialServerName = ServerResponse["server"]["name"];
export type McpJsonServerName = ServerJson["name"];
export type TipServerName = string;

export interface OfficialServersReadyParams {
  count: number;
  loadedAt: string;
}

export interface OfficialServersNotReadyResult {
  ready: false;
}

export interface OfficialServersReadyResult {
  ready: true;
  count: number;
  loadedAt: string;
  nextCursor?: string;
  servers: ServerResponse[];
}

export type OfficialServersListResult =
  | OfficialServersNotReadyResult
  | OfficialServersReadyResult;

export interface OfficialServersListParams {
  category?: string;
  cursor?: string;
  search?: string;
}

export interface McpJsonServersListResult {
  servers: ServerJson[];
}

export interface McpJsonServersChangedParams {
  servers: ServerJson[];
}

export interface TipServerListEntry {
  name: TipServerName;
}

export interface TipServersListResult {
  servers: TipServerListEntry[];
}

export type OfficialServerConnectTarget =
  | {
    type: "remote";
    index: number;
  }
  | {
    type: "package";
    index: number;
  };

export interface OfficialServerConnectParams {
  name: OfficialServerName;
  target: OfficialServerConnectTarget;
}

export interface McpJsonServerConnectParams {
  name: McpJsonServerName;
}

export interface TipServerConnectParams {
  name: TipServerName;
}

export interface TipServerRegisterParams {
  name: TipServerName;
  url: string;
}

export interface TipServerRegisterResult {
  name: TipServerName;
}

export interface ConnectServerResult {
  url: string;
}

export type ListServersParams =
  | ({
    type: "official";
  } & OfficialServersListParams)
  | {
    type: "mcpjson";
  }
  | {
    type: "tip";
  };

export type ListServersResult =
  | ({
    type: "official";
  } & OfficialServersListResult)
  | ({
    type: "mcpjson";
  } & McpJsonServersListResult)
  | ({
    type: "tip";
  } & TipServersListResult);

export type ConnectServersParams =
  | ({
    type: "official";
  } & OfficialServerConnectParams)
  | ({
    type: "mcpjson";
  } & McpJsonServerConnectParams)
  | ({
    type: "tip";
  } & TipServerConnectParams);

export type ConnectServersResult =
  | ({
    type: "official";
  } & ConnectServerResult)
  | ({
    type: "mcpjson";
  } & ConnectServerResult)
  | ({
    type: "tip";
  } & ConnectServerResult);

export interface AddMcpJsonServerParams {
  server: ServerJson;
}

export interface RemoveMcpJsonServerParams {
  name: McpJsonServerName;
}

export const protocol = createProtocol(({ request, notification }) => ({
  clientToServer: {
    requests: {
      listServers: request("servers/list")<
        ListServersParams,
        ListServersResult
      >(),
      connectServer: request("servers/connect")<
        ConnectServersParams,
        ConnectServersResult
      >(),
      listOfficialServers: request("servers/official/list")<
        OfficialServersListParams | undefined,
        OfficialServersListResult
      >(),
      connectOfficialServer: request("servers/official/connect")<
        OfficialServerConnectParams,
        ConnectServerResult
      >(),
      listMcpJsonServers: request("servers/mcpjson/list")<
        void,
        McpJsonServersListResult
      >(),
      addMcpJsonServer: request("servers/mcpjson/add")<
        AddMcpJsonServerParams,
        McpJsonServersListResult
      >(),
      removeMcpJsonServer: request("servers/mcpjson/remove")<
        RemoveMcpJsonServerParams,
        McpJsonServersListResult
      >(),
      connectMcpJsonServer: request("servers/mcpjson/connect")<
        McpJsonServerConnectParams,
        ConnectServerResult
      >(),
      listTipServers: request("servers/tip/list")<
        void,
        TipServersListResult
      >(),
      connectTipServer: request("servers/tip/connect")<
        TipServerConnectParams,
        ConnectServerResult
      >(),
      registerTipServer: request("tip/register")<
        TipServerRegisterParams,
        TipServerRegisterResult
      >(),
    },
  },
  serverToClient: {
    notifications: {
      officialServersReady: notification("servers/official/ready")<
        OfficialServersReadyParams
      >(),
      mcpJsonServersChanged: notification("servers/mcpjson/listChanged")<
        McpJsonServersChangedParams
      >(),
    },
  },
  bidirectional: {},
}));

export type ManagerProtocol =
  typeof protocol extends ProtocolInstance<infer Definition>
    ? Definition
    : never;

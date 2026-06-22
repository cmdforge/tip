import type { ServerJson, ServerResponse } from "./index.js";
import {
  createProtocol,
} from "@cmdforge/jsonrpc";
import type { ProtocolInstance } from "@cmdforge/jsonrpc";

export type ServerType = "official" | "tip";

export type OfficialServerName = string;
export type TipServerName = string;

export interface OfficialServersReadyParams {
  count: number;
  loadedAt: string;
  // Optional error message explaining why servers may be missing
  error?: string | null;
}

// Unified list result used by both official and tip list endpoints
export interface ServersListResult {
  total: number;
  nextCursor?: string;
  servers: ServerJson[];
}

export type OfficialServersListResult = ServersListResult;

export interface OfficialServersListParams {
  category?: string;
  cursor?: string;
  search?: string;
}

export interface TipServersChangedParams {
  servers: ServerJson[];
}

export type TipServersListResult = ServersListResult;

export type OfficialServerConnectTarget = {
  type: "remote";
  index: number;
} | {
  type: "package";
  index: number;
};

export interface OfficialServerConnectParams {
  name: OfficialServerName;
  version?: string;
  target: OfficialServerConnectTarget;
}

export interface TipServerConnectParams {
  name: TipServerName;
}

export interface TipServerRegisterParams {
  server: ServerJson;
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
    type: "tip";
  };

export type ListServersResult =
  | ({
    type: "official";
  } & OfficialServersListResult)
  | ({
    type: "tip";
  } & TipServersListResult);

export type ConnectServersParams =
  | ({
    type: "official";
  } & OfficialServerConnectParams)
  | ({
    type: "tip";
  } & TipServerConnectParams);

export type ConnectServersResult =
  | ({
    type: "official";
  } & ConnectServerResult)
  | ({
    type: "tip";
  } & ConnectServerResult);

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
      tipServersChanged: notification("servers/tip/listChanged")<
        TipServersChangedParams
      >(),
    },
  },
  bidirectional: {},
}));

export type ManagerProtocol =
  typeof protocol extends ProtocolInstance<infer Definition>
    ? Definition
    : never;

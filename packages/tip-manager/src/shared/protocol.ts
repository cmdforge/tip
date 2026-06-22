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

export interface TipServersChangedParams {
  servers: ServerJson[];
}

export interface TipServersListResult {
  servers: ServerJson[];
}

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
      listOfficialServers: request("servers/official/list")<
        OfficialServersListParams | undefined,
        OfficialServersListResult
      >(),
      connectOfficialServer: request("servers/official/connect")<
        OfficialServerConnectParams,
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

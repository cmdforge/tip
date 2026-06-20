import { createProtocol } from "@cmdforge/jsonrpc";
import type { ProtocolInstance } from "@cmdforge/jsonrpc";

export interface TipConnectResult {
  url: string;
}

export const tipProtocol = createProtocol(({ request }) => ({
  clientToServer: {
    requests: {
      connect: request("tip/connect")<
        void,
        TipConnectResult
      >(),
    },
  },
  serverToClient: {},
  bidirectional: {},
}));

export type TipProtocol =
  typeof tipProtocol extends ProtocolInstance<infer Definition>
    ? Definition
    : never;

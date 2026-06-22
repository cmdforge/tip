export * from './registry-client.js';
export * from './getAllServers.js';
export * from './utils.js';

import { invalidParamsError } from '@cmdforge/jsonrpc';
import { createServerFactory } from '@cmdforge/jsonrpc/server';
import type {
  ConnectServersParams,
  ListServersParams,
  OfficialServersListParams,
  OfficialServerConnectParams,
  TipServerConnectParams,
  TipServerRegisterParams,
} from '../shared/protocol.js';
import { protocol } from '../shared/protocol.js';
import { getManagerInstance } from './manager.js';

const manager = getManagerInstance();

export const serverFactory = createServerFactory(protocol, (peer) => {
  manager.addSession(peer);

  // Start background cache-syncing for this server peer. The cache sync
  // routine will create the registry folders and can use the peer to
  // send notifications (e.g., officialServersReady) when data becomes available.
  peer.inbound.requests.servers.list(
    async (params: ListServersParams) => {
      switch (params.type) {
        case 'official':
          return {
            type: params.type,
            ...await manager.getOfficialServers(params),
          };
        case 'tip':
          return {
            type: params.type,
            ...await manager.getTipServers(),
          };
        default:
          throw invalidParams(params);
      }
    },
  );

  peer.inbound.requests.servers.connect(
    async (params: ConnectServersParams) => {
      switch (params.type) {
        case 'official':
          return {
            type: params.type,
            ...await manager.connectOfficialServer(params),
          };
        case 'tip':
          return {
            type: params.type,
            ...await manager.connectTipServer(params),
          };
        default:
          throw invalidParams(params);
      }
    },
  );


  peer.inbound.requests.tip.register(
    async (params: TipServerRegisterParams) => {
      manager.registerTipServer(params);
      return { name: params.server.name };
    },
  );
});

function invalidParams(params: unknown) {
  return invalidParamsError(params);
}

export * from './registry-client.js';
export * from './getAllServers.js';

import { invalidParamsError } from '@cmdforge/jsonrpc';
import { createServerFactory } from '@cmdforge/jsonrpc/server';
import type {
  ConnectServersParams,
  ListServersParams,
  OfficialServersListParams,
  TipServerRegisterParams,
} from '../shared/protocol.js';
import { protocol } from '../shared/protocol.js';
import { getManagerInstance } from './manager.js';

const manager = getManagerInstance();

export const serverFactory = createServerFactory(protocol, (peer) => {
  manager.addSession(peer);

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

  peer.inbound.requests.servers.official.list(
    async (params: OfficialServersListParams = {}) => {
      return await manager.getOfficialServers(params);
    },
  );

  peer.inbound.requests.servers.official.connect(
    async (params) => {
      return await manager.connectOfficialServer(params);
    },
  );

  peer.inbound.requests.servers.tip.list(
    async () => {
      return await manager.getTipServers();
    },
  );

  peer.inbound.requests.servers.tip.connect(
    async (params) => {
      return await manager.connectTipServer(params);
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

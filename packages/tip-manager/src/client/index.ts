import type {
  ClientFactory,
  CreateWebSocketClientOptions,
} from '@cmdforge/jsonrpc/client';
import { createClientFactory } from '@cmdforge/jsonrpc/client';
import type {
  ProtocolDefinition,
  ProtocolPeer,
} from '@cmdforge/jsonrpc';
import type {
  ConnectServersParams,
  ConnectServersResult,
  ManagerProtocol,
  McpJsonServerConnectParams,
  OfficialServerConnectParams,
  TipServerConnectParams,
} from '../shared/protocol.js';
import { protocol } from '../shared/protocol.js';

export interface ConnectedServer<Definition extends ProtocolDefinition> {
  peer: ProtocolPeer<Definition, "client">;
  type: ConnectServersResult["type"];
  url: string;
}

export interface ManagerClientFactory extends ClientFactory<ManagerProtocol> {
  connectWebSocket(
    url: string,
    options?: CreateWebSocketClientOptions,
  ): Promise<ManagerClientPeer>;
}

export interface ManagerClientPeer extends ProtocolPeer<ManagerProtocol, "client"> {
  connectServer<Definition extends ProtocolDefinition>(
    params: ConnectServersParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ): Promise<ConnectedServer<Definition>>;
  connectOfficialServer<Definition extends ProtocolDefinition>(
    params: OfficialServerConnectParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ): Promise<ConnectedServer<Definition>>;
  connectMcpJsonServer<Definition extends ProtocolDefinition>(
    params: McpJsonServerConnectParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ): Promise<ConnectedServer<Definition>>;
  connectTipServer<Definition extends ProtocolDefinition>(
    params: TipServerConnectParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ): Promise<ConnectedServer<Definition>>;
}

const baseClientFactory = createClientFactory(protocol, (peer) => {
  attachManagerClient(peer as ManagerClientPeer);
});

export const clientFactory: ManagerClientFactory = {
  ...baseClientFactory,
  async connectWebSocket(url, options) {
    return await baseClientFactory.connectWebSocket(
      url,
      options,
    ) as ManagerClientPeer;
  },
};

export async function connectServer<Definition extends ProtocolDefinition>(
  peer: ProtocolPeer<ManagerProtocol, "client">,
  params: ConnectServersParams,
  clientFactory: ClientFactory<Definition>,
  options?: CreateWebSocketClientOptions,
): Promise<ConnectedServer<Definition>> {
  const result = await peer.outbound.requests.servers.connect(params);
  const connectedPeer = await clientFactory.connectWebSocket(result.url, options);

  return {
    peer: connectedPeer,
    type: result.type,
    url: result.url,
  };
}

function attachManagerClient(peer: ManagerClientPeer) {
  peer.connectServer = async function connectManagedServer<
    Definition extends ProtocolDefinition,
  >(
    params: ConnectServersParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ) {
    return await connectServer(this, params, clientFactory, options);
  };

  peer.connectOfficialServer = async function connectManagedOfficialServer<
    Definition extends ProtocolDefinition,
  >(
    params: OfficialServerConnectParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ) {
    return await connectServer(
      this,
      {
        type: "official",
        ...params,
      },
      clientFactory,
      options,
    );
  };

  peer.connectMcpJsonServer = async function connectManagedMcpJsonServer<
    Definition extends ProtocolDefinition,
  >(
    params: McpJsonServerConnectParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ) {
    return await connectServer(
      this,
      {
        type: "mcpjson",
        ...params,
      },
      clientFactory,
      options,
    );
  };

  peer.connectTipServer = async function connectManagedTipServer<
    Definition extends ProtocolDefinition,
  >(
    params: TipServerConnectParams,
    clientFactory: ClientFactory<Definition>,
    options?: CreateWebSocketClientOptions,
  ) {
    return await connectServer(
      this,
      {
        type: "tip",
        ...params,
      },
      clientFactory,
      options,
    );
  };
}

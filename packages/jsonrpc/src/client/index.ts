import type {
  ProtocolDefinition,
  ProtocolInitializer,
  ProtocolInstance,
  ProtocolPeer,
} from "../shared/index.js";
import {
  createWebSocketClient,
  type CreateWebSocketClientOptions,
} from "./createWebSocketClient.js";

export type { CreateWebSocketClientOptions } from "./createWebSocketClient.js";

export interface ClientFactory<Definition extends ProtocolDefinition> {
  readonly protocol: ProtocolInstance<Definition>;
  readonly initialize?: ProtocolInitializer<Definition, "client">;
  connectWebSocket(
    url: string,
    options?: CreateWebSocketClientOptions,
  ): Promise<ProtocolPeer<Definition, "client">>;
}

export function createClientFactory<Definition extends ProtocolDefinition>(
  protocol: ProtocolInstance<Definition>,
  initialize?: ProtocolInitializer<Definition, "client">,
): ClientFactory<Definition> {
  return {
    protocol,
    initialize,
    connectWebSocket(url, options) {
      return createWebSocketClient(
        url,
        protocol,
        initialize,
        options,
      );
    },
  };
}

import {
  createMessageConnection,
  type Logger,
} from "vscode-jsonrpc";
import {
  toSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from "vscode-ws-jsonrpc";
import type {
  JsonRpcConnectionLike,
  ProtocolDefinition,
  ProtocolInitializer,
  ProtocolInstance,
  ProtocolPeer,
} from "../shared/index.js";

export interface CreateWebSocketClientOptions {
  logger?: Logger;
  WebSocket?: typeof WebSocket;
}

export async function createWebSocketClient<
  Definition extends ProtocolDefinition,
>(
  url: string,
  protocol: ProtocolInstance<Definition>,
  initialize?: ProtocolInitializer<Definition, "client">,
  options: CreateWebSocketClientOptions = {},
): Promise<ProtocolPeer<Definition, "client">> {
  const WebSocketConstructor = await resolveWebSocketConstructor(options);

  return await new Promise((resolve, reject) => {
    const webSocket = new WebSocketConstructor(url);

    const rejectOnce = (reason: unknown) => {
      cleanup();
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };

    const cleanup = () => {
      webSocket.onerror = null;
      webSocket.onclose = null;
    };

    webSocket.onerror = (event) => {
      const message =
        typeof event === "object" &&
          event &&
          "message" in event &&
          typeof event.message === "string"
          ? event.message
          : `failed to connect to ${url}`;

      rejectOnce(new Error(message));
    };

    webSocket.onclose = (event) => {
      rejectOnce(
        new Error(
          `ws closed before JSON-RPC connection was established (${event.code}: ${event.reason})`,
        ),
      );
    };

    webSocket.onopen = () => {
      cleanup();

      const socket = toSocket(webSocket);
      const reader = new WebSocketMessageReader(socket);
      const writer = new WebSocketMessageWriter(socket);
      const connection = createMessageConnection(
        reader,
        writer,
        options.logger,
      );

      const peer = protocol.client(
        connection as JsonRpcConnectionLike,
        initialize,
      );
      connection.listen();
      resolve(peer);
    };
  });
}

async function resolveWebSocketConstructor(
  options: CreateWebSocketClientOptions,
): Promise<typeof WebSocket> {
  if (options.WebSocket) {
    return options.WebSocket;
  }

  if (typeof WebSocket !== "undefined") {
    return WebSocket;
  }

  const module = await import("ws");
  return module.default as unknown as typeof WebSocket;
}

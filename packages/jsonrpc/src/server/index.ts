import {
  createMessageConnection,
  type Logger,
} from "vscode-jsonrpc";
import {
  toSocket,
  WebSocketMessageReader,
  WebSocketMessageWriter,
} from "vscode-ws-jsonrpc";
import {
  WebSocketServer,
  type WebSocket,
} from "ws";
import type {
  JsonRpcConnectionLike,
  ProtocolDefinition,
  ProtocolInitializer,
  ProtocolInstance,
  ProtocolPeer,
} from "../shared/index.js";

export interface ServerFactory<Definition extends ProtocolDefinition> {
  readonly protocol: ProtocolInstance<Definition>;
  readonly initialize?: ProtocolInitializer<Definition, "server">;
  acceptWebSocket(
    webSocket: WebSocket,
    options?: AcceptWebSocketOptions,
  ): ProtocolPeer<Definition, "server">;
  startWebSocket(
    options?: StartWebSocketServerOptions<Definition>,
  ): Promise<StartedWebSocketServer<Definition>>;
}

export interface AcceptWebSocketOptions {
  logger?: Logger;
}

export interface StartWebSocketServerOptions<
  Definition extends ProtocolDefinition,
> extends AcceptWebSocketOptions {
  host?: string;
  path?: string;
  port?: number;
  onPeer?: (peer: ProtocolPeer<Definition, "server">) => void;
}

export interface StartedWebSocketServer<
  Definition extends ProtocolDefinition,
> {
  readonly server: WebSocketServer;
  readonly url: string;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export function createServerFactory<Definition extends ProtocolDefinition>(
  protocol: ProtocolInstance<Definition>,
  initialize?: ProtocolInitializer<Definition, "server">,
): ServerFactory<Definition> {
  return {
    protocol,
    initialize,
    acceptWebSocket(webSocket, options) {
      const socket = toSocket(webSocket as unknown as globalThis.WebSocket);
      const reader = new WebSocketMessageReader(socket);
      const writer = new WebSocketMessageWriter(socket);
      const connection = createMessageConnection(
        reader,
        writer,
        options?.logger,
      );

      const peer = protocol.server(
        connection as JsonRpcConnectionLike,
        initialize,
      );

      connection.listen();
      return peer;
    },
    async startWebSocket(options = {}) {
      const server = new WebSocketServer({
        host: options.host,
        path: options.path,
        port: options.port,
      });

      let closedResolved = false;
      let closeServerPromise: Promise<void> | undefined;

      let resolveClosed!: () => void;
      const closed = new Promise<void>((resolve) => {
        resolveClosed = () => {
          if (closedResolved) {
            return;
          }

          closedResolved = true;
          resolve();
        };
      });

      server.once("close", () => {
        resolveClosed();
      });

      server.once("error", () => {
        resolveClosed();
      });

      const closeServer = () => {
        if (!closeServerPromise) {
          closeServerPromise = new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            });
          }).finally(() => {
            resolveClosed();
          });
        }

        return closeServerPromise;
      };

      server.on("connection", (webSocket) => {
        try {
          const acceptedPeer = this.acceptWebSocket(webSocket, options);
          options.onPeer?.(acceptedPeer);
        } catch (error) {
          webSocket.close(1011, "failed to initialize websocket session");
        }
      });

      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", reject);
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("unable to determine websocket server address");
      }

      const host = normalizeHostForUrl(options.host ?? address.address);
      const path = options.path ?? "";

      return {
        server,
        url: `ws://${host}:${address.port}${path}`,
        closed,
        close() {
          for (const client of server.clients) {
            if (client.readyState < client.CLOSING) {
              client.close();
            }
          }

          return closeServer();
        },
      };
    },
  };
}

function normalizeHostForUrl(host: string) {
  if (host === "::" || host === "0.0.0.0") {
    return "127.0.0.1";
  }

  return host;
}

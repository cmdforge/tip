import { readFile } from "node:fs/promises";
import os from "node:os";
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServerFactory } from "@cmdforge/jsonrpc/server";
import type { HandlerForTools, ProtocolTools } from "../shared/index.js";
import { tipProtocol } from "../shared/tip-protocol.js";
import { registerAppUI } from "./app.js";
import { registerTools } from "./mcp.js";

export interface RegisterTipServerOptions {
  name: string;
  htmlFile?: string;
}

export const tipServerFactory = createServerFactory(tipProtocol);

export async function registerTipServer<TTools extends ProtocolTools>(
  handler: HandlerForTools<TTools>,
  options: RegisterTipServerOptions,
) {
  const htmlString = options.htmlFile
    ? await readFile(options.htmlFile, { encoding: "utf8" })
    : undefined;

  return await tipServerFactory.startWebSocket({
    host: "127.0.0.1",
    port: 0,
    onPeer(peer) {
      peer.inbound.requests.tip.connect(async () => {
        const started = await startTipMcpServer(handler, {
          name: options.name,
          htmlString,
        });

        return { url: started.url };
      });
    },
  });
}

interface StartTipMcpServerOptions {
  name: string;
  htmlString?: string;
}

interface StartedTipMcpServer {
  url: string;
  close(): Promise<void>;
}

async function startTipMcpServer<TTools extends ProtocolTools>(
  handler: HandlerForTools<TTools>,
  options: StartTipMcpServerOptions,
): Promise<StartedTipMcpServer> {
  const server = new McpServer({
    name: options.name,
    version: "0.0.0",
  });

  registerTools(server, handler);

  if (options.htmlString) {
    registerAppUI(server, options.htmlString);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const pathname = "/mcp";
  const httpServer = createServer(async (request, response) => {
    await handleTipServerRequest(pathname, transport, request, response);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("unable to determine tip MCP server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}${pathname}`,
    async close() {
      await transport.close();
      await server.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

async function handleTipServerRequest(
  pathname: string,
  transport: StreamableHTTPServerTransport,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const target = new URL(request.url ?? pathname, "http://127.0.0.1");
  if (target.pathname !== pathname) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  try {
    await transport.handleRequest(request, response);
  } catch (error) {
    if (response.headersSent) {
      response.end();
      return;
    }

    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : String(error));
  }
}

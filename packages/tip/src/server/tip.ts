import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type {
  HandlerForTools,
  ProtocolTools,
} from "../shared/index.js";
import { registerAppUI } from "./app.js";
import { registerTools } from "./mcp.js";

export interface StartTipServerOptions {
  name: string;
  htmlFile?: string;
}

export interface StartedTipServer {
  url: string;
  close(): Promise<void>;
}

export async function startTipServer<TTools extends ProtocolTools>(
  handler: HandlerForTools<TTools>,
  options: StartTipServerOptions,
): Promise<StartedTipServer> {
  return await startTipMcpServer(handler, {
    name: options.name,
    htmlFile: options.htmlFile,
  });
}

interface StartTipMcpServerOptions {
  name: string;
  htmlFile?: string;
}

async function startTipMcpServer<TTools extends ProtocolTools>(
  handler: HandlerForTools<TTools>,
  options: StartTipMcpServerOptions,
): Promise<StartedTipServer> {
  const server = new McpServer({
    name: options.name,
    version: "0.0.0",
  });

  registerTools(server, handler);

  if (options.htmlFile) {
    registerAppUI(server, async () => {
      return await readFile(options.htmlFile!, { encoding: "utf8" });
    });
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

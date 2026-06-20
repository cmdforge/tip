import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ProtocolInstance, ProtocolPeer } from "@cmdforge/jsonrpc";
import { createProtocol, request } from "@cmdforge/jsonrpc";
import { createClientFactory } from "@cmdforge/jsonrpc/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type {
  HandlerForTools,
  ProtocolTools,
  ServerJson,
} from "../shared/index.js";
import {
  mergeTipServerStartupMeta,
  tipServerSchemaUrl,
  type TipServerStartupOptions,
} from "./server-entry.js";
import { ensureManagerStarted } from "./utils.js";
import { registerAppUI } from "./app.js";
import { registerTools } from "./mcp.js";

interface TipManagerRegisterParams {
  server: ServerJson;
}

interface TipManagerRegisterResult {
  name: string;
}

const managerRegistrationProtocol = createProtocol(({ request }) => ({
  clientToServer: {
    requests: {
      register: request("tip/register")<
        TipManagerRegisterParams,
        TipManagerRegisterResult
      >(),
    },
  },
  serverToClient: {},
  bidirectional: {},
}));

type ManagerRegistrationProtocol =
  typeof managerRegistrationProtocol extends ProtocolInstance<infer Definition>
    ? Definition
    : never;

const managerRegistrationClient = createClientFactory(managerRegistrationProtocol);

export interface CreateTipServerJsonOptions extends TipServerStartupOptions {
  name: string;
  description: string;
  title?: string;
  version?: string;
  websiteUrl?: string;
}

export type RegisterTipServerOptions =
  | ({
    server: ServerJson;
    startup?: TipServerStartupOptions;
  })
  | CreateTipServerJsonOptions;

export function createTipServerJson(options: CreateTipServerJsonOptions): ServerJson {
  const server: ServerJson = {
    $schema: tipServerSchemaUrl,
    name: options.name,
    description: options.description,
    version: options.version ?? "0.0.0",
    ...(options.title ? { title: options.title } : {}),
    ...(options.websiteUrl ? { websiteUrl: options.websiteUrl } : {}),
  };

  return mergeTipServerStartupMeta(server, {
    command: options.command,
    ...(options.args ? { args: options.args } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
}

export async function registerTipServer(options: RegisterTipServerOptions) {
  const manager = await ensureManagerStarted();
  const peer = await managerRegistrationClient.connectWebSocket(manager.url);

  try {
    const server = resolveRegisteredServer(options);
    return await peer.outbound.requests.tip.register({ server });
  } finally {
    closePeer(peer);
  }
}

export type StartTipServerOptions = RegisterTipServerOptions & {
  htmlFile?: string;
  register?: boolean;
};

export interface StartedTipServer {
  url: string;
  close(): Promise<void>;
}

export async function startTipServer<TTools extends ProtocolTools>(
  handler: HandlerForTools<TTools>,
  options: StartTipServerOptions,
): Promise<StartedTipServer> {
  const htmlString = options.htmlFile
    ? await readFile(options.htmlFile, { encoding: "utf8" })
    : undefined;
  const registration = toRegisterTipServerOptions(options);

  if (options.register !== false) {
    await registerTipServer(registration);
  }

  return await startTipMcpServer(handler, {
    name: resolveRegisteredServer(registration).name,
    htmlString,
  });
}

function resolveRegisteredServer(options: RegisterTipServerOptions): ServerJson {
  if ("server" in options) {
    return options.startup
      ? mergeTipServerStartupMeta(options.server, options.startup)
      : options.server;
  }

  return createTipServerJson(options);
}

function toRegisterTipServerOptions(options: StartTipServerOptions): RegisterTipServerOptions {
  const { htmlFile: _htmlFile, register: _register, ...registration } = options;
  return registration;
}

function closePeer(peer: ProtocolPeer<ManagerRegistrationProtocol, "client">) {
  const connection = peer.connection as {
    end?: () => void;
    dispose?: () => void;
  };

  connection.end?.();
  connection.dispose?.();
}

interface StartTipMcpServerOptions {
  name: string;
  htmlString?: string;
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

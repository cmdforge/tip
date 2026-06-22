import { createServer, type IncomingMessage, type ServerResponse as HttpServerResponse } from "node:http";
import type { Buffer } from "node:buffer";
import type { ProtocolPeer } from "@cmdforge/jsonrpc";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  type ServerJson,
  type ServerResponse,
} from "../shared/index.js";
import type {
  ConnectServerResult,
  ManagerProtocol,
  OfficialServerConnectParams,
  OfficialServersListParams,
  OfficialServersListResult,
  OfficialServersReadyParams,
  TipServerConnectParams,
  TipServerRegisterParams,
  TipServersChangedParams,
  TipServersListResult,
} from "../shared/protocol.js";
import { getAllServers } from "./getAllServers.js";

const PAGE_SIZE = 100;

export interface ManagerInstance {
  addSession(peer: ProtocolPeer<ManagerProtocol, "server">): void;
  registerTipServer(params: TipServerRegisterParams): void;
  getOfficialServers(params: OfficialServersListParams): Promise<OfficialServersListResult>;
  getTipServers(): Promise<TipServersListResult>;
  connectOfficialServer(params: OfficialServerConnectParams): Promise<ConnectServerResult>;
  connectTipServer(params: TipServerConnectParams): Promise<ConnectServerResult>;
}

interface OfficialState {
  allServers: Awaited<ReturnType<typeof getAllServers>>;
  latestServers: Awaited<ReturnType<typeof getAllServers>>;
  loadedAt: string;
}

interface StartedPackageBridge {
  closed: Promise<void>;
  close(): Promise<void>;
  url: string;
}

let managerInstance: ManagerInstance | undefined;

export function getManagerInstance(): ManagerInstance {
  managerInstance ??= createManagerInstance();
  return managerInstance;
}

export function createManagerInstance(
  options: {
    loadOfficialServers?: typeof getAllServers;
    startPackageBridge?: (
      pkg: NonNullable<ServerJson["packages"]>[number],
    ) => Promise<StartedPackageBridge>;
  } = {},
): ManagerInstance {
  const sessions = new Set<ProtocolPeer<ManagerProtocol, "server">>();
  const tipServers = new Map<string, ServerJson>();
  const packageConnections = new Map<string, Promise<StartedPackageBridge>>();
  let officialState: OfficialState | undefined;
  const loadServers = options.loadOfficialServers ?? getAllServers;
  const startBridge = options.startPackageBridge ?? startPackageBridge;

  const officialReady = loadOfficialState(loadServers).then((state) => {
    officialState = state;
    const params: OfficialServersReadyParams = {
      count: state.latestServers.length,
      loadedAt: state.loadedAt,
    };

    for (const peer of sessions) {
      peer.outbound.notifications.servers.official.ready(params);
    }

    return state;
  });

  return {
    addSession(peer) {
      sessions.add(peer);

      if (officialState) {
        peer.outbound.notifications.servers.official.ready({
          count: officialState.latestServers.length,
          loadedAt: officialState.loadedAt,
        });
        return;
      }

      void officialReady.then((state) => {
        peer.outbound.notifications.servers.official.ready({
          count: state.latestServers.length,
          loadedAt: state.loadedAt,
        });
      });
    },
    registerTipServer(params) {
      tipServers.set(params.server.name, params.server);

      const changed: TipServersChangedParams = {
        servers: sortTipServers(tipServers.values()),
      };

      for (const peer of sessions) {
        peer.outbound.notifications.servers.tip.listChanged(changed);
      }
    },
    async getOfficialServers(params) {
      if (!officialState) {
        if (params.cursor || params.search || params.category) {
          await officialReady;
        } else {
          return {
            ready: false,
          };
        }
      }

      const state = officialState ?? await officialReady;
      const filtered = filterOfficialServers(state.latestServers, params);
      const start = parseCursor(params.cursor);
      const servers = filtered.slice(start, start + PAGE_SIZE);
      const nextCursor =
        start + servers.length < filtered.length
          ? String(start + PAGE_SIZE)
          : undefined;

      return {
        ready: true,
        count: servers.length,
        loadedAt: state.loadedAt,
        ...(nextCursor ? { nextCursor } : {}),
        servers,
      };
    },
    async getTipServers() {
      return {
        servers: sortTipServers(tipServers.values()),
      };
    },
    async connectOfficialServer(params) {
      const state = officialState ?? await officialReady;
      const entry = resolveOfficialEntry(state, params);

      if (!entry) {
        throw new Error(
          `Official server not found: ${formatRequestedOfficialName(params.name, params.version)}`,
        );
      }

      if (params.target.type === "remote") {
        const remote = entry.server.remotes?.[params.target.index];

        if (!remote) {
          throw new Error(
            `Remote target ${params.target.index} not found for official server: ${params.name}`,
          );
        }

        if (!remote.url) {
          throw new Error(
            `Remote target ${params.target.index} has no URL for official server: ${params.name}`,
          );
        }

        if (!isWebSocketUrl(remote.url)) {
          throw new Error(
            `Remote target ${params.target.index} is not a WebSocket URL and requires a bridge: ${params.name}`,
          );
        }

        return {
          url: remote.url,
        };
      }

      const pkg = entry.server.packages?.[params.target.index];
      if (!pkg) {
        throw new Error(
          `Package target ${params.target.index} not found for official server: ${entry.server.name}@${entry.server.version}`,
        );
      }

      return await connectPackageServer(
        packageConnections,
        `official:${entry.server.name}@${entry.server.version}:${params.target.index}`,
        pkg,
        startBridge,
      );
    },
    async connectTipServer(params) {
      const server = tipServers.get(params.name);
      if (!server) {
        throw new Error(`tip server not registered: ${params.name}`);
      }

      return await connectRegisteredTipServer(server, packageConnections, startBridge);
    },
  };
}

async function loadOfficialState(loadServers: typeof getAllServers): Promise<OfficialState> {
  const allServers = await loadServers();
  const latestServers = allServers.filter(
    (server) =>
      server?._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest === true,
  );

  return {
    allServers,
    latestServers,
    loadedAt: new Date().toISOString(),
  };
}

function filterOfficialServers(
  servers: Awaited<ReturnType<typeof getAllServers>>,
  params: OfficialServersListParams,
) {
  const search = params.search?.trim().toLowerCase();
  const category = params.category?.trim().toLowerCase();

  const filtered = servers.filter((entry) => {
    if (search && !matchesSearch(entry, search)) {
      return false;
    }

    if (category && !entryCategories(entry).has(category)) {
      return false;
    }

    return true;
  });

  filtered.sort((left, right) => left.server.name.localeCompare(right.server.name));
  return filtered;
}

function matchesSearch(
  entry: NonNullable<Awaited<ReturnType<typeof getAllServers>>[number]>,
  search: string,
) {
  const haystack = [
    entry.server.name,
    entry.server.title,
    entry.server.description,
    entry.server.websiteUrl,
    entry.server.repository?.url,
    ...(entry.server.packages?.map((pkg) => pkg.identifier) ?? []),
    ...(entry.server.remotes?.map((remote) => remote.url) ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();

  return haystack.includes(search);
}

function entryCategories(
  entry: NonNullable<Awaited<ReturnType<typeof getAllServers>>[number]>,
) {
  const categories = new Set<string>();

  for (const remote of entry.server.remotes ?? []) {
    categories.add(remote.type.toLowerCase());
  }

  for (const pkg of entry.server.packages ?? []) {
    categories.add(pkg.registryType.toLowerCase());
    categories.add(pkg.transport.type.toLowerCase());
  }

  return categories;
}

function parseCursor(cursor?: string) {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isWebSocketUrl(url: string) {
  return url.startsWith("ws://") || url.startsWith("wss://");
}

function sortTipServers(servers: Iterable<ServerJson>) {
  return [...servers].sort((left, right) => left.name.localeCompare(right.name));
}

function resolveOfficialEntry(
  state: OfficialState,
  params: OfficialServerConnectParams,
): ServerResponse | undefined {
  const requested = parseRequestedOfficialName(params.name, params.version);
  const candidates = state.allServers.filter((entry) => entry.server.name === requested.name);

  if (requested.version) {
    return candidates.find((entry) => entry.server.version === requested.version);
  }

  return candidates.find(
    (entry) => entry._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest === true,
  ) ?? candidates[0];
}

function parseRequestedOfficialName(name: string, version?: string) {
  if (version) {
    return { name, version };
  }

  const at = name.lastIndexOf("@");
  if (at <= 0) {
    return { name };
  }

  return {
    name: name.slice(0, at),
    version: name.slice(at + 1),
  };
}

function formatRequestedOfficialName(name: string, version?: string) {
  const requested = parseRequestedOfficialName(name, version);
  return requested.version ? `${requested.name}@${requested.version}` : requested.name;
}

async function connectRegisteredTipServer(
  server: ServerJson,
  packageConnections?: Map<string, Promise<StartedPackageBridge>>,
  startBridge: (
    pkg: NonNullable<ServerJson["packages"]>[number],
  ) => Promise<StartedPackageBridge> = startPackageBridge,
): Promise<ConnectServerResult> {
  const remote = server.remotes?.find((entry) => typeof entry.url === "string");
  if (remote?.url) {
    return {
      url: remote.url,
    };
  }

  const pkg = server.packages?.[0];
  if (pkg) {
    return await connectPackageServer(
      packageConnections ?? new Map(),
      `tip:${server.name}:0`,
      pkg,
      startBridge,
    );
  }

  throw new Error(`tip server has no usable remote or package entry: ${server.name}`);
}

async function connectPackageServer(
  packageConnections: Map<string, Promise<StartedPackageBridge>>,
  key: string,
  pkg: NonNullable<ServerJson["packages"]>[number],
  startBridge: (
    pkg: NonNullable<ServerJson["packages"]>[number],
  ) => Promise<StartedPackageBridge>,
): Promise<ConnectServerResult> {
  let started = packageConnections.get(key);

  if (!started) {
    started = startBridge(pkg);
    packageConnections.set(key, started);
    void started.then((bridge) => {
      void bridge.closed.finally(() => {
        packageConnections.delete(key);
      });
    }).catch(() => {
      packageConnections.delete(key);
    });
  }

  const bridge = await started;
  return { url: bridge.url };
}

export async function startPackageBridge(
  pkg: NonNullable<ServerJson["packages"]>[number],
): Promise<StartedPackageBridge> {
  if (pkg.transport.type !== "stdio") {
    throw new Error(
      `Package transport is not launchable by manager: ${pkg.transport.type}`,
    );
  }

  const attempts = createLaunchAttempts(pkg);
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return await startPackageBridgeAttempt(attempt.command, attempt.args, pkg);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to launch package target: ${pkg.identifier}`);
}

async function startPackageBridgeAttempt(
  command: string,
  args: string[],
  pkg: NonNullable<ServerJson["packages"]>[number],
): Promise<StartedPackageBridge> {
  const childTransport = new StdioClientTransport({
    command,
    args,
    env: toEnvironment(pkg.environmentVariables),
    stderr: "pipe",
  });
  const httpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  let closed = false;
  let stderrText = "";
  let rejectClosed!: (reason?: unknown) => void;
  let resolveClosed!: () => void;

  const closedPromise = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });

  const finishClosed = (error?: unknown) => {
    if (closed) {
      return;
    }

    closed = true;
    if (error) {
      rejectClosed(error);
      return;
    }

    resolveClosed();
  };

  const stderr = childTransport.stderr;
  stderr?.on("data", (chunk: string | Buffer) => {
    stderrText += String(chunk);
    if (stderrText.length > 4000) {
      stderrText = stderrText.slice(-4000);
    }
  });

  childTransport.onclose = () => {
    finishClosed(new Error(formatLaunchFailure(pkg.identifier, command, args, stderrText)));
  };
  childTransport.onerror = (error: Error) => {
    finishClosed(error);
  };
  httpTransport.onclose = () => {
    finishClosed();
  };
  httpTransport.onerror = (error: Error) => {
    finishClosed(error);
  };
  const closeHttpServer = async (httpServer: ReturnType<typeof createServer>) => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  childTransport.onmessage = (message: JSONRPCMessage) => {
    void httpTransport.send(
      message,
      isJsonRpcResponse(message) ? { relatedRequestId: message.id } : undefined,
    ).catch((error) => {
      finishClosed(error);
    });
  };
  httpTransport.onmessage = (message: JSONRPCMessage) => {
    void childTransport.send(message).catch((error) => {
      finishClosed(error);
    });
  };

  let httpServer: ReturnType<typeof createServer> | undefined;
  const close = async () => {
    try {
      await httpTransport.close();
    } finally {
      try {
        await childTransport.close();
      } finally {
        if (httpServer) {
          await closeHttpServer(httpServer);
        }
      }
    }
  };

  try {
    await childTransport.start();
    await waitForStableStartup(closedPromise);
    await httpTransport.start();

    const pathname = "/mcp";
    httpServer = createServer(async (request, response) => {
      await handleBridgeRequest(pathname, httpTransport, request, response);
    });

    await new Promise<void>((resolve, reject) => {
      httpServer!.once("error", reject);
      httpServer!.listen(0, "127.0.0.1", () => resolve());
    });

    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error(`unable to determine package bridge address for ${pkg.identifier}`);
    }

    return {
      url: `http://127.0.0.1:${address.port}${pathname}`,
      closed: closedPromise.catch(() => undefined),
      async close() {
        await close();
      },
    };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

function createLaunchAttempts(pkg: NonNullable<ServerJson["packages"]>[number]) {
  const primary = createLaunchAttempt(pkg, false);
  const canRetryWithPackageArguments =
    (pkg.runtimeArguments?.length ?? 0) > 0 &&
    (pkg.packageArguments?.length ?? 0) === 0;

  if (!canRetryWithPackageArguments) {
    return [primary];
  }

  return [
    primary,
    createLaunchAttempt(pkg, true),
  ];
}

function createLaunchAttempt(
  pkg: NonNullable<ServerJson["packages"]>[number],
  moveRuntimeArgumentsAfterIdentifier: boolean,
) {
  const command = getRuntimeCommand(pkg);
  const runtimeArguments = expandArguments(pkg.runtimeArguments);
  const packageArguments = expandArguments(pkg.packageArguments);
  const leadingRuntimeArguments = moveRuntimeArgumentsAfterIdentifier ? [] : runtimeArguments;
  const trailingArguments = moveRuntimeArgumentsAfterIdentifier
    ? runtimeArguments
    : packageArguments;

  return {
    command,
    args: [
      ...leadingRuntimeArguments,
      withVersion(pkg.identifier, pkg.version),
      ...(moveRuntimeArgumentsAfterIdentifier ? trailingArguments : packageArguments),
    ],
  };
}

function getRuntimeCommand(pkg: NonNullable<ServerJson["packages"]>[number]) {
  if (pkg.runtimeHint) {
    return pkg.runtimeHint;
  }

  switch (pkg.registryType) {
    case "npm":
      return "npx";
    case "pypi":
      return "uvx";
    case "oci":
      return "docker";
    case "nuget":
      return "dnx";
    default:
      throw new Error(
        `Unable to determine runtime command for registry type: ${pkg.registryType}`,
      );
  }
}

function expandArguments(
  argumentsList: Array<{
    name?: string;
    type: string;
    value?: string;
  }> | null | undefined,
) {
  const result: string[] = [];

  for (const argument of argumentsList ?? []) {
    if (argument.type === "named") {
      if (argument.name) {
        result.push(argument.name);
      }
      if (argument.value !== undefined) {
        result.push(argument.value);
      }
      continue;
    }

    if (argument.value !== undefined) {
      result.push(argument.value);
    }
  }

  return result;
}

function toEnvironment(
  variables: Array<{
    name: string;
    value?: string;
  }> | null | undefined,
) {
  const entries = (variables ?? [])
    .filter((entry): entry is { name: string; value: string } => entry.value !== undefined)
    .map((entry) => [entry.name, entry.value] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function withVersion(identifier: string, version?: string) {
  if (!version || identifier.includes("@")) {
    return identifier;
  }

  return `${identifier}@${version}`;
}

function isJsonRpcResponse(message: JSONRPCMessage): message is JSONRPCMessage & { id: string | number } {
  return !("method" in message) && "id" in message;
}

function formatLaunchFailure(
  identifier: string,
  command: string,
  args: string[],
  stderrText: string,
) {
  const suffix = stderrText.trim() ? `\n${stderrText.trim()}` : "";
  return `Package launch failed for ${identifier}: ${command} ${args.join(" ")}${suffix}`;
}

async function waitForStableStartup(closed: Promise<void>) {
  await Promise.race([
    closed.then(() => {
      throw new Error("Package process exited before bridge startup completed.");
    }),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 150);
    }),
  ]);
}

async function handleBridgeRequest(
  pathname: string,
  transport: StreamableHTTPServerTransport,
  request: IncomingMessage,
  response: HttpServerResponse,
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

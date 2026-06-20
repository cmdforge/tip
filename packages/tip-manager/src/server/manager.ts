import type { ProtocolPeer } from "@cmdforge/jsonrpc";
import { tipClientFactory } from "@cmdforge/tip/client";
import type {
  ConnectServerResult,
  ManagerProtocol,
  McpJsonServerConnectParams,
  McpJsonServersListResult,
  OfficialServerConnectParams,
  OfficialServersListParams,
  OfficialServersListResult,
  OfficialServersReadyParams,
  TipServerConnectParams,
  TipServerRegisterParams,
  TipServersListResult,
} from "../shared/protocol.js";
import { getAllServers } from "./getAllServers.js";

const PAGE_SIZE = 100;

export interface ManagerInstance {
  addSession(peer: ProtocolPeer<ManagerProtocol, "server">): void;
  registerTipServer(params: TipServerRegisterParams): void;
  getOfficialServers(params: OfficialServersListParams): Promise<OfficialServersListResult>;
  getMcpJsonServers(): Promise<McpJsonServersListResult>;
  getTipServers(): Promise<TipServersListResult>;
  connectOfficialServer(params: OfficialServerConnectParams): Promise<ConnectServerResult>;
  connectMcpJsonServer(params: McpJsonServerConnectParams): Promise<ConnectServerResult>;
  connectTipServer(params: TipServerConnectParams): Promise<ConnectServerResult>;
}

interface OfficialState {
  latestServers: Awaited<ReturnType<typeof getAllServers>>;
  loadedAt: string;
}

let managerInstance: ManagerInstance | undefined;

export function getManagerInstance(): ManagerInstance {
  managerInstance ??= createManagerInstance();
  return managerInstance;
}

function createManagerInstance(): ManagerInstance {
  const sessions = new Set<ProtocolPeer<ManagerProtocol, "server">>();
  const tipServers = new Map<string, string>();
  let officialState: OfficialState | undefined;

  const officialReady = loadOfficialState().then((state) => {
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
      tipServers.set(params.name, params.url);
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
    async getMcpJsonServers() {
      return {
        servers: [],
      };
    },
    async getTipServers() {
      return {
        servers: [...tipServers.keys()]
          .sort((left, right) => left.localeCompare(right))
          .map((name) => ({ name })),
      };
    },
    async connectOfficialServer(params) {
      const state = officialState ?? await officialReady;
      const entry = state.latestServers.find((server) => server.server.name === params.name);

      if (!entry) {
        throw new Error(`Official server not found: ${params.name}`);
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

      throw new Error(
        `Package targets are not implemented yet for official server: ${params.name}`,
      );
    },
    async connectMcpJsonServer(params) {
      throw new Error(`mcpjson server connect is not implemented yet: ${params.name}`);
    },
    async connectTipServer(params) {
      const url = tipServers.get(params.name);

      if (!url) {
        throw new Error(`tip server not registered: ${params.name}`);
      }

      const peer = await tipClientFactory.connectWebSocket(url);
      return await peer.outbound.requests.tip.connect();
    },
  };
}

async function loadOfficialState(): Promise<OfficialState> {
  const allServers = await getAllServers();
  const latestServers = allServers.filter(
    (server) =>
      server?._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest === true,
  );

  return {
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

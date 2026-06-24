import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import {
  ElicitRequestSchema,
  ElicitationCompleteNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";

export async function createConfiguredClient(transportConfig, clientInfo = {}) {
  const serverEventState = {
    payload: null,
    triggered: false,
  };

  let resolveServerEvent;
  const serverEvent = new Promise((resolve) => {
    resolveServerEvent = resolve;
  });

  const signalServerEvent = (payload) => {
    if (serverEventState.triggered) {
      return;
    }

    serverEventState.triggered = true;
    serverEventState.payload = {
      __mcpSkillEarlyExit: true,
      ...payload,
    };
    resolveServerEvent(serverEventState.payload);
  };

  const client = new Client(
    {
      name: clientInfo.name ?? "@cmdforge/generated-mcp-skill",
      version: clientInfo.version ?? "0.0.0",
    },
    {
      capabilities: {
        elicitation: {
          form: {},
          url: {},
        },
      },
    },
  );

  client.fallbackNotificationHandler = async (notification) => {
    console.error(
      `[mcp-skill] Unhandled server notification: ${notification.method}`,
    );
    signalServerEvent({
      kind: "notification",
      method: notification.method,
      params: notification.params ?? null,
    });
  };

  client.fallbackRequestHandler = async (request) => {
    console.error(`[mcp-skill] Unhandled server request: ${request.method}`);
    signalServerEvent({
      kind: "request",
      method: request.method,
      params: request.params ?? null,
    });
    throw new Error(`Unhandled server request: ${request.method}`);
  };

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    const mode = request.params?.mode ?? "form";
    const message = request.params?.message ?? "No message was provided.";
    const url = "url" in request.params ? request.params.url : undefined;

    console.error(`[mcp-skill] Server requested elicitation (${mode}): ${message}`);
    if (url) {
      console.error(`[mcp-skill] Elicitation URL: ${url}`);
    }

    signalServerEvent({
      kind: "request",
      method: request.method,
      mode,
      message,
      ...(url ? { url } : {}),
    });

    return {
      action: "decline",
    };
  });

  client.setNotificationHandler(ElicitationCompleteNotificationSchema, async (notification) => {
    console.error(
      `[mcp-skill] Server completed elicitation: ${notification.params.elicitationId}`,
    );
    signalServerEvent({
      kind: "notification",
      method: notification.method,
      elicitationId: notification.params.elicitationId,
    });
  });

  await client.connect(createTransport(transportConfig));

  client.__mcpSkillServerEvent = serverEvent;
  client.__mcpSkillServerEventState = serverEventState;
  return client;
}

export function makeSafeName(value, fallback = "server") {
  const safeValue = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeValue || fallback;
}

function createTransport(transportConfig) {
  switch (transportConfig.type) {
    case "stdio":
      return new StdioClientTransport({
        command: transportConfig.command,
        args: transportConfig.args,
        cwd: transportConfig.cwd,
        env: transportConfig.env && Object.keys(transportConfig.env).length > 0
          ? transportConfig.env
          : undefined,
      });
    case "http":
      return new StreamableHTTPClientTransport(
        new URL(transportConfig.url),
        createRemoteTransportOptions(transportConfig),
      );
    case "sse":
      return new SSEClientTransport(
        new URL(transportConfig.url),
        createRemoteTransportOptions(transportConfig),
      );
    case "ws":
      return new WebSocketClientTransport(new URL(transportConfig.url));
    default:
      throw new Error(`Unsupported transport: ${transportConfig.type}`);
  }
}

function createRemoteTransportOptions(transportConfig) {
  const headers = transportConfig.headers && Object.keys(transportConfig.headers).length > 0
    ? transportConfig.headers
    : undefined;

  return {
    ...(headers ? { requestInit: { headers } } : {}),
    fetch: createDebugFetch(),
  };
}

function createDebugFetch() {
  return async (input, init) => {
    const response = await fetch(input, init);

    if (!response.ok) {
      const debug = await serializeErrorResponse(response);
      console.error(`[mcp-skill] Remote transport error:\n${JSON.stringify(debug, null, 2)}`);
    }

    return response;
  };
}

async function serializeErrorResponse(response) {
  let bodyText = null;

  try {
    bodyText = await response.clone().text();
  } catch {
    bodyText = null;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    bodyText,
  };
}

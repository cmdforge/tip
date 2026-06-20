import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  TextInput,
} from "@mantine/core";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket";
import { type PropsWithChildren, useEffect, useRef, useState } from "react";
import { getTipTransportForUrl } from "@cmdforge/tip";
import { McpClientProvider } from "../context/mcpClient";
import { useAppStore } from "../state/appStore";

type ConnectedClient = {
  client: Client;
  close(): Promise<void>;
};

async function connectClient(serverUrl: string): Promise<ConnectedClient> {
  const url = new URL(serverUrl);
  const transportType = getTipTransportForUrl(serverUrl);
  const transport =
    transportType === "websocket"
      ? new WebSocketClientTransport(url)
      : new StreamableHTTPClientTransport(url);

  const client = new Client({
    name: "tip-ui",
    version: "0.0.0",
  });

  await client.connect(transport);

  return {
    client,
    close: () => transport.close(),
  };
}

export function ServerSelection({
  children,
  initialUrl,
}: PropsWithChildren<{ initialUrl: string }>) {
  const serverUrl = useAppStore((state) => state.serverUrl);
  const isConnecting = useAppStore((state) => state.isConnecting);
  const connectionError = useAppStore((state) => state.connectionError);
  const tools = useAppStore((state) => state.tools);
  const infoModalTitle = useAppStore((state) => state.infoModalTitle);
  const infoModalValue = useAppStore((state) => state.infoModalValue);
  const actions = useAppStore((state) => state.actions);
  const connectionRef = useRef<ConnectedClient | null>(null);
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    actions.setServerUrl(initialUrl);
  }, [actions, initialUrl]);

  useEffect(() => {
    return () => {
      void connectionRef.current?.close();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!serverUrl.trim()) {
      actions.connectionFailed("Enter a server URL first.");
      setClient(null);
      return;
    }

    actions.startConnecting();
    setClient(null);

    try {
      await connectionRef.current?.close();

      const connectedClient = await connectClient(serverUrl.trim());
      const { tools } = await connectedClient.client.listTools();

      connectionRef.current = connectedClient;
      setClient(connectedClient.client);
      actions.connectionSucceeded(tools);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect.";
      actions.connectionFailed(message);
      connectionRef.current = null;
      setClient(null);
    }
  }

  return (
    <Paper className="border border-stone-200 shadow-sm" p="md" radius="md">
      <Stack gap="md">
        <form onSubmit={handleSubmit}>
          <Group align="end" gap="sm" wrap="nowrap">
            <TextInput
              className="flex-1"
              placeholder="https://example.com/mcp"
              value={serverUrl}
              onChange={(event) => actions.setServerUrl(event.currentTarget.value)}
            />
            <Button type="submit" color="dark" loading={isConnecting}>
              Go
            </Button>
            <Button
              color="gray"
              disabled={!client}
              type="button"
              variant="default"
              onClick={() => actions.openInfoModal("Server tools", tools)}
            >
              Info
            </Button>
          </Group>
        </form>

        {connectionError ? (
          <Alert color="red" title="Connection failed" variant="light">
            {connectionError}
          </Alert>
        ) : null}

        {client ? (
          <McpClientProvider value={client}>
            {children}
          </McpClientProvider>
        ) : null}

        <Modal
          opened={Boolean(infoModalTitle)}
          onClose={() => actions.closeInfoModal()}
          size="lg"
          title={infoModalTitle ?? "Info"}
        >
          <Code block>{JSON.stringify(infoModalValue, null, 2)}</Code>
        </Modal>
      </Stack>
    </Paper>
  );
}

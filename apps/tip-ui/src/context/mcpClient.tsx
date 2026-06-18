import type { Client } from "@modelcontextprotocol/sdk/client";
import { createContext, useContext } from "react";

const McpClientContext = createContext<Client | null>(null);

export const McpClientProvider = McpClientContext.Provider;

export function useMcpClient() {
  const client = useContext(McpClientContext);

  if (!client) {
    throw new Error("useMcpClient must be used within McpClientProvider");
  }

  return client;
}

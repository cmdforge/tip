import type { ManagerClientPeer } from "@cmdforge/tip-manager/client";
import { createContext, useContext } from "react";

const ManagerClientContext = createContext<ManagerClientPeer | null>(null);

export const ManagerClientProvider = ManagerClientContext.Provider;

export function useManagerClient() {
  const client = useContext(ManagerClientContext);

  if (!client) {
    throw new Error("useManagerClient must be used within ManagerClientProvider");
  }

  return client;
}

export default ManagerClientContext;

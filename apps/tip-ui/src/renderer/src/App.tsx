import { Box, Loader, Title, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { AppStoreProvider, type ManagerDaemonInfo } from "./state/appStore";
import { ManagerClientProvider } from "./context/managerClient";
import { clientFactory as managerClientFactory, type ManagerClientPeer } from "@cmdforge/tip-manager/client";
import AppShellLayout from "./components/AppShellLayout";

type LaunchOptions = {
  serverUrl?: string;
};

type StartupState = {
  daemonInfo: ManagerDaemonInfo | null;
  launchOptions: LaunchOptions;
};

export default function App() {
  const [startupState, setStartupState] = useState<StartupState | null>(null);
  const [managerClient, setManagerClient] = useState<ManagerClientPeer | null>(null);
  const managerRef = useRef<ManagerClientPeer | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      window.api.getLaunchOptions(),
      window.api.getManagerDaemonInfo(),
    ]).then(([launchOptions, daemonInfo]) => {
      if (!cancelled) {
        setStartupState({
          daemonInfo,
          launchOptions,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connectManager() {
      if (!startupState) return;

      // Treat missing daemonInfo as an unrecoverable error
      if (!startupState.daemonInfo) {
        console.error("Manager daemon info missing; cannot continue.");
        return;
      }

      try {
        const connected = await managerClientFactory.connectWebSocket(startupState.daemonInfo.url);
        managerRef.current = connected;
        if (!cancelled) setManagerClient(connected);
      } catch (error) {
        console.error("Failed to connect to manager client:", error);
      }
    }

    void connectManager();

    return () => {
      cancelled = true;
      const toClose = managerRef.current;
      if (toClose && typeof (toClose as any).close === "function") {
        try {
          // fire-and-forget close
          (toClose as any).close();
        } catch (e) {
          // ignore
        }
      }
      managerRef.current = null;
    };
  }, [startupState]);

  // startupState must exist and must contain daemonInfo
  if (!startupState) {
    return (
      <Box className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader color="dark" />
      </Box>
    );
  }

  if (!startupState.daemonInfo) {
    return (
      <Box className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-6">
        <Title order={2}>Failed to start manager daemon</Title>
        <Text color="dimmed" size="sm" mt="md">
          The manager daemon did not start. Check the main process logs for errors.
        </Text>
      </Box>
    );
  }

  if (!managerClient) {
    return (
      <Box className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader color="dark" />
      </Box>
    );
  }

  return (
    <ManagerClientProvider value={managerClient}>
      <AppStoreProvider
        initialDaemonInfo={startupState.daemonInfo}
        initialServerUrl={startupState.launchOptions.serverUrl ?? ""}
      >
        <AppShellLayout />
      </AppStoreProvider>
    </ManagerClientProvider>
  );
}

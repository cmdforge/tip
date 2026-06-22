import { Box, Loader, Stack, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { ServerSelection } from "./components/ServerSelection";
import { ToolSelection } from "./components/ToolSelection";
import { AppStoreProvider, type ManagerDaemonInfo, useAppStore } from "./state/appStore";

type LaunchOptions = {
  serverUrl?: string;
};

type StartupState = {
  daemonInfo: ManagerDaemonInfo | null;
  launchOptions: LaunchOptions;
};

function AppShell() {
  const serverUrl = useAppStore((state) => state.serverUrl);

  return (
    <Box className="min-h-screen bg-stone-50 text-stone-950">
      <Box className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Stack gap={4}>
          <Title order={1} className="font-semibold tracking-tight">
            TIP UI
          </Title>
        </Stack>

        <ServerSelection initialUrl={serverUrl}>
          <ToolSelection />
        </ServerSelection>
      </Box>
    </Box>
  );
}

function App() {
  const [startupState, setStartupState] = useState<StartupState | null>(null);

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

  if (!startupState) {
    return (
      <Box className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader color="dark" />
      </Box>
    );
  }

  return (
    <AppStoreProvider
      initialDaemonInfo={startupState.daemonInfo}
      initialServerUrl={startupState.launchOptions.serverUrl ?? ""}
    >
      <AppShell />
    </AppStoreProvider>
  );
}

export default App;

import { Box, Loader, Stack, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { ServerSelection } from "./components/ServerSelection";
import { ToolSelection } from "./components/ToolSelection";
import { AppStoreProvider, useAppStore } from "./state/appStore";

type LaunchOptions = {
  serverUrl?: string;
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
  const [launchOptions, setLaunchOptions] = useState<LaunchOptions | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.api.getLaunchOptions().then((value) => {
      if (!cancelled) {
        setLaunchOptions(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!launchOptions) {
    return (
      <Box className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader color="dark" />
      </Box>
    );
  }

  return (
    <AppStoreProvider initialServerUrl={launchOptions.serverUrl ?? ""}>
      <AppShell />
    </AppStoreProvider>
  );
}

export default App;

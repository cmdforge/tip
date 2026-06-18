import { useEffect, useState } from "react";
import { Box, Code, Stack, Text } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";

type LaunchOptions = {
  serverUrl?: string;
};

function App() {
  const [launchOptions, setLaunchOptions] = useState<LaunchOptions | null>(null);

  useEffect(() => {
    let cancelled = false;

    void invoke<LaunchOptions>("get_launch_options").then((value) => {
      if (!cancelled) {
        setLaunchOptions(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box className="min-h-screen p-6">
      <Stack gap="sm">
        <Text>App</Text>
        <Code block>{launchOptions?.serverUrl ?? "No server URL provided"}</Code>
      </Stack>
    </Box>
  );
}

export default App;

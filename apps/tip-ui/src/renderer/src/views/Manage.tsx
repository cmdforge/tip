import { Box, Text, Button, Group } from "@mantine/core";
import { useState } from "react";

export default function ManageView() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setBusy(true);
    setMessage(null);
    try {
      // @ts-ignore - defined in preload
      const result = await window.api.refreshManager();
      if (result?.success) {
        setMessage("Manager restarted successfully.");
      } else {
        setMessage(`Failed: ${result?.error ?? 'unknown'}`);
      }
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box p="md">
      <Text fw={600}>Manage</Text>
      <Text color="dimmed" size="sm" mt="8px">Manager details and daemon state will appear here.</Text>

      <Group mt="md">
        <Button onClick={handleRefresh} loading={busy}>Refresh Manager</Button>
        {message && <Text size="sm">{message}</Text>}
      </Group>
    </Box>
  );
}

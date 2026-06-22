import { Box, Text } from "@mantine/core";

export default function SessionView() {
  return (
    <Box p="md">
      <Text fw={600}>Session</Text>
      <Text color="dimmed" size="sm" mt="8px">Session details and messages will appear here.</Text>
    </Box>
  );
}

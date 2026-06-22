import { Box, Text } from "@mantine/core";

export default function ManageView() {
  return (
    <Box p="md">
      <Text fw={600}>Manage</Text>
      <Text color="dimmed" size="sm" mt="8px">Manager details and daemon state will appear here.</Text>
    </Box>
  );
}

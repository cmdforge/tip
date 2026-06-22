import { Text, Stack, NavLink, ScrollArea, AppShell } from "@mantine/core";
import { useAppStore } from "../state/appStore";

export default function SessionList() {
  // Placeholder until persistence is wired
  const sessionsPlaceholder = [
    { id: "session-1", title: "example.com@1.0.0" },
    { id: "session-2", title: "local-tip@0.1.0" },
  ];

  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const actions = useAppStore((s) => s.actions);

  return (
    <AppShell.Section grow style={{ overflow: "hidden" }}>
      <Text size="sm" style={{ paddingLeft: 12 }} color="dimmed" fw={600}>
        Sessions
      </Text>

      <ScrollArea style={{ height: "calc(100vh - 220px)" }}>
        <Stack px="sm" gap={8}>
          {sessionsPlaceholder.map((s) => (
            <NavLink
              key={s.id}
              label={s.title}
              active={currentSessionId === s.id}
              onClick={() => {
                actions.setCurrentSessionId(s.id);
                actions.setCurrentView("session");
              }}
            />
          ))}
        </Stack>
      </ScrollArea>
    </AppShell.Section>
  );
}

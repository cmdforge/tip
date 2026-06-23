import { useState } from "react";
import {
  Text,
  Stack,
  ScrollArea,
  AppShell,
  UnstyledButton,
  ThemeIcon,
  ActionIcon,
  Box,
} from "@mantine/core";
import { IconChevronDown, IconExternalLink, IconX } from "@tabler/icons-react";
import { useAppStore } from "../state/appStore";

export default function SessionList() {
  // Placeholder grouped sessions until persistence is wired
  const sessionsPlaceholder = [
    {
      parentId: "p1",
      name: "example.com",
      children: [
        { id: "session-1", title: "example.com@1.0.0" },
        { id: "session-1-2", title: "example.com@2.0.0" },
      ],
    },
    {
      parentId: "p2",
      name: "local-tip",
      children: [{ id: "session-2", title: "local-tip@0.1.0" }],
    },
  ];

  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const actions = useAppStore((s) => s.actions);

  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  function toggleParent(id: string) {
    setOpenParents((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <AppShell.Section grow style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Text size="sm" style={{ paddingLeft: 12 }} color="dimmed" fw={600}>
        Sessions
      </Text>

      <Box style={{ flex: 1, overflow: "hidden", paddingTop: 8 }}>
        <ScrollArea style={{ height: "100%" }}>
          <Stack px="sm" gap={6}>
            {sessionsPlaceholder.map((group) => (
              <div key={group.parentId}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <UnstyledButton
                    onClick={() => toggleParent(group.parentId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      width: "100%",
                      textAlign: "left",
                    }}
                    aria-expanded={!!openParents[group.parentId]}
                  >
                    <ThemeIcon size="sm" variant="light">
                      <IconChevronDown size={16} />
                    </ThemeIcon>
                    <Text fw={600}>{group.name}</Text>
                  </UnstyledButton>

                  <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                    <ActionIcon size="sm" variant="light" onClick={() => { /* open parent */ }} aria-label={`Open ${group.name}`}>
                      <IconExternalLink size={14} />
                    </ActionIcon>
                    <ActionIcon size="sm" color="red" variant="light" onClick={() => { /* remove parent */ }} aria-label={`Remove ${group.name}`}>
                      <IconX size={14} />
                    </ActionIcon>
                  </div>
                </div>

                {openParents[group.parentId] ? (
                  <Stack px="md" mt={6} gap={4}>
                    {group.children.map((s) => (
                      <UnstyledButton
                        key={s.id}
                        onClick={() => {
                          actions.setCurrentSessionId(s.id);
                          actions.setCurrentView("session");
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 8px",
                          borderRadius: 6,
                          backgroundColor: currentSessionId === s.id ? "#e9ecef" : undefined,
                        }}
                        aria-pressed={currentSessionId === s.id}
                      >
                        <Text size="sm">{s.title}</Text>
                      </UnstyledButton>
                    ))}
                  </Stack>
                ) : null}
              </div>
            ))}
          </Stack>
        </ScrollArea>
      </Box>
    </AppShell.Section>
  );
}

import {
  AppShell,
  Box,
  Stack,
  Title,
  UnstyledButton,
  ThemeIcon,
  Text,
  Divider,
} from "@mantine/core";
import ExploreView from "../views/Explore";
import ManageView from "../views/Manage";
import QuickConnectView from "../views/QuickConnect";
import SessionView from "../views/Session";
import SessionList from "./SessionList";
import { useAppStore } from "../state/appStore";
import { navItems } from "./navItems";

export default function AppShellLayout() {
  const currentView = useAppStore((s) => s.currentView);
  const actions = useAppStore((s) => s.actions);

  return (
    <AppShell padding={0} styles={{ main: { height: "100vh", overflow: "auto" } }} navbar={{ width: 250, breakpoint: 'sm' }}>
      <AppShell.Navbar p="xs">
        <AppShell.Section>
          <Stack gap="xs">
            <Title order={4}>TIP</Title>

            <Divider />

            <Stack gap={4}>
              {navItems.map((item) => (
                <UnstyledButton
                  key={item.view}
                  onClick={() => actions.setCurrentView(item.view)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    backgroundColor: currentView === item.view ? '#e9ecef' : undefined,
                    cursor: 'pointer',
                  }}
                  aria-pressed={currentView === item.view}
                >
                  <ThemeIcon variant="light" size="sm">
                    <item.Icon size={16} />
                  </ThemeIcon>
                  <Text ml="sm">{item.label}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </Stack>
        </AppShell.Section>

        <AppShell.Section mt="sm" grow>
          <Divider />
          <SessionList />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box p="md">
          {currentView === "explore" && <ExploreView />}
          {currentView === "manage" && <ManageView />}
          {currentView === "quick-connect" && <QuickConnectView />}
          {currentView === "session" && <SessionView />}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

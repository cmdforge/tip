import {
  AppShell,
  Box,
  Stack,
  Title,
  NavLink,
  Divider,
} from "@mantine/core";
import ExploreView from "../views/Explore";
import ManageView from "../views/Manage";
import QuickConnectView from "../views/QuickConnect";
import SessionView from "../views/Session";
import SessionList from "./SessionList";
import { useAppStore } from "../state/appStore";

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
              <NavLink label="Explore" active={currentView === "explore"} onClick={() => actions.setCurrentView("explore")} />
              <NavLink label="Manage" active={currentView === "manage"} onClick={() => actions.setCurrentView("manage")} />
              <NavLink label="Quick Connect" active={currentView === "quick-connect"} onClick={() => actions.setCurrentView("quick-connect")} />
            </Stack>
          </Stack>
        </AppShell.Section>

        <AppShell.Section mt="sm">
          <Divider />
        </AppShell.Section>

        <SessionList />
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

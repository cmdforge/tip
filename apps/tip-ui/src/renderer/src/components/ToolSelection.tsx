import { Alert, Button, Group, Paper, Select, Tabs } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { ToolForm } from "./ToolForm";
import { ToolUI } from "./ToolUI";
import { useAppStore } from "../state/appStore";

function getToolUiResourceUri(tool: { _meta?: Record<string, unknown> }) {
  const ui = tool._meta?.ui;

  if (!ui || typeof ui !== "object") {
    return undefined;
  }

  const resourceUri = (ui as { resourceUri?: unknown }).resourceUri;
  return typeof resourceUri === "string" ? resourceUri : undefined;
}

export function ToolSelection() {
  const tools = useAppStore((state) => state.tools);
  const selectedToolName = useAppStore((state) => state.selectedToolName);
  const selectedTab = useAppStore((state) => state.selectedTab);
  const actions = useAppStore((state) => state.actions);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedToolName) ?? null,
    [selectedToolName, tools],
  );
  const hasUi = selectedTool ? Boolean(getToolUiResourceUri(selectedTool)) : false;

  useEffect(() => {
    actions.syncSelectedTool(selectedTool);
  }, [actions, selectedTool]);

  if (tools.length === 0) {
    return (
      <Alert color="yellow" title="No tools available" variant="light">
        The connected server did not return any tools.
      </Alert>
    );
  }

  return (
    <Paper className="border border-stone-200 shadow-sm" p="md" radius="md">
      <Tabs
        value={selectedTab}
        onChange={(value) => {
          if (value === "ui" || value === "form") {
            actions.setSelectedTab(value);
          }
        }}
      >
        <Group align="end" gap="sm" wrap="nowrap" mb="md">
          <Select
            className="flex-1"
            data={tools.map((tool) => ({
              value: tool.name,
              label: tool.title ?? tool.name,
            }))}
            value={selectedToolName}
            onChange={(value) => actions.setSelectedToolName(value)}
          />
          <Button
            color="gray"
            type="button"
            variant="default"
            onClick={() => {
              if (selectedTool) {
                actions.openInfoModal(
                  selectedTool.title ?? selectedTool.name,
                  selectedTool,
                );
              }
            }}
          >
            Info
          </Button>
        </Group>

        <Tabs.List grow>
          <Tabs.Tab disabled={!hasUi} value="ui">
            UI
          </Tabs.Tab>
          <Tabs.Tab value="form">Form</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="ui">
          {selectedTool && hasUi ? <ToolUI selectedTool={selectedTool} /> : null}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="form">
          {selectedTool ? <ToolForm selectedTool={selectedTool} /> : null}
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}

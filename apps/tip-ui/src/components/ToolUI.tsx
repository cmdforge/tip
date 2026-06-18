import { Alert, Paper } from "@mantine/core";
import { AppRenderer, type AppRendererProps } from "@mcp-ui/client";
import type { Tool } from "@modelcontextprotocol/sdk/types";
import { useMemo } from "react";
import { useMcpClient } from "../context/mcpClient";

function getToolUiResourceUri(tool: Tool) {
  const ui = tool._meta?.ui;

  if (!ui || typeof ui !== "object") {
    return undefined;
  }

  const resourceUri = (ui as { resourceUri?: unknown }).resourceUri;
  return typeof resourceUri === "string" ? resourceUri : undefined;
}

export function ToolUI({ selectedTool }: { selectedTool: Tool }) {
  const client = useMcpClient();
  const toolResourceUri = getToolUiResourceUri(selectedTool);
  const sandboxUrl = useMemo(
    () => new URL("/sandbox_proxy.html", window.location.href),
    [],
  );

  if (!toolResourceUri) {
    return (
      <Alert color="yellow" title="Tool UI unavailable" variant="light">
        This tool does not expose a UI resource.
      </Alert>
    );
  }

  return (
    <Paper className="overflow-hidden border border-stone-200 shadow-sm" radius="md">
      <AppRenderer
        client={client as unknown as AppRendererProps["client"]}
        hostInfo={{ name: "tip-ui", version: "0.0.0" }}
        onError={(error) => console.error(error)}
        sandbox={{ url: sandboxUrl }}
        toolName={selectedTool.name}
        toolResourceUri={toolResourceUri}
      />
    </Paper>
  );
}

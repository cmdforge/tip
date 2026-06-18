import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import { createUIResource } from '@mcp-ui/server';
import { appToolName, appToolUri } from '../shared/index.js';

export function registerAppUI(server: McpServer, htmlString: string) {
  const ui = createUIResource({
    uri: appToolUri,
    content: { type: 'rawHtml', htmlString },
    encoding: 'text',
  });

  registerAppResource(server, ui.resource.uri, ui.resource.uri, {}, async () => ({
    contents: [ui.resource]
  }));

  registerAppTool(server, appToolName, {
    description: 'Show UI',
    inputSchema: {},
    _meta: { ui: { resourceUri: ui.resource.uri } }
  }, async () => {
    return { content: [{ type: 'text', text: `No Content` }] };
  });
}
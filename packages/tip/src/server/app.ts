import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import { createUIResource } from '@mcp-ui/server';
import { appToolName, appToolUri } from '../shared/index.js';

export function registerAppUI(
  server: McpServer,
  getHtmlString: () => Promise<string>,
) {
  registerAppResource(server, appToolUri, appToolUri, {}, async () => {
    const ui = createUIResource({
      uri: appToolUri,
      content: { type: 'rawHtml', htmlString: await getHtmlString() },
      encoding: 'text',
    });

    return {
      contents: [ui.resource],
    };
  });

  registerAppTool(server, appToolName, {
    description: 'Show UI',
    inputSchema: {},
    _meta: { ui: { resourceUri: appToolUri } }
  }, async () => {
    return { content: [{ type: 'text', text: `No Content` }] };
  });
}

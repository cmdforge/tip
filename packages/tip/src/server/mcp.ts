import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HandlerForTools, InputFor, OutputFor, ProtocolTools } from "../shared/index.js";

export function registerTools<TTools extends ProtocolTools>(
  server: McpServer,
  handler: HandlerForTools<TTools>,
) {
  const tools = handler.$protocol.tools;

  function registerOne<K extends keyof TTools>(
    name: K,
    def: TTools[K],
    fn: HandlerForTools<TTools>[K],
  ) {
    type In = InputFor<TTools[K]>;
    type Out = OutputFor<TTools[K]>;

    if (def.outputSchema) {
      const outputSchema = def.outputSchema;

      server.registerTool(
        name as string,
        {
          inputSchema: def.inputSchema,
          outputSchema,
        },
        async (args) => {
          const parsedArgs = def.inputSchema.parse(args) as In;

          // TS does not keep the correlation here, so rebind once:
          const typedFn = fn as (input: In) => Promise<Out>;
          const rawResult = await typedFn(parsedArgs);

          // outputSchema exists in this branch, so Out is not void in practice
          const structured = outputSchema.parse(rawResult) as Exclude<Out, void>;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structured),
              },
            ],
            structuredContent: structured,
          };
        }
      );
    } else {
      server.registerTool(
        name as string,
        {
          inputSchema: def.inputSchema,
        },
        async (args) => {
          const parsedArgs = def.inputSchema.parse(args) as In;

          const typedFn = fn as (input: In) => Promise<void>;
          await typedFn(parsedArgs);

          return {
            content: [],
          };
        }
      );
    }
  }

  for (const key in tools) {
    registerOne(key, tools[key], handler[key]);
  }

  return server;
}

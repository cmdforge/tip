import type { App } from "@modelcontextprotocol/ext-apps";
import type { HandlerForTools, InputFor, OutputFor, Protocol, ProtocolTools } from "../shared/index.js";

export function createAppHandler<TTools extends ProtocolTools>(
  app: App,
  protocol: Protocol<TTools>
): HandlerForTools<TTools> {
  const tools = protocol.tools;

  function createOne<K extends keyof TTools>(name: K) {
    const def = tools[name];

    return async (input: InputFor<TTools[K]>): Promise<OutputFor<TTools[K]>> => {
      const result = await app.callServerTool({
        name: name as string,
        arguments: input,
      });

      if (!def.outputSchema) {
        return undefined as OutputFor<TTools[K]>;
      }

      const structured = result.structuredContent;

      return def.outputSchema.parse(structured) as OutputFor<TTools[K]>;
    };
  }

  return protocol.handler(Object.keys(tools).reduce((p, c) => ({ ...p, [c]: createOne(c) }), {} as HandlerForTools<TTools>));
}
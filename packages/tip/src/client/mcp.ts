import type { Client } from "@modelcontextprotocol/sdk/client";
import type { Protocol, ProtocolTools, HandlerForTools, InputFor, OutputFor } from "../shared/index.js";

export function createMcpHandler<TTools extends ProtocolTools>(
  client: Client,
  protocol: Protocol<TTools>
): HandlerForTools<TTools> {
  const tools = protocol.tools;

  function createOne<K extends keyof TTools>(name: K) {
    const def = tools[name];

    return async (input: InputFor<TTools[K]>): Promise<OutputFor<TTools[K]>> => {
      const result = await client.callTool({
        name: name as string,
        arguments: input,
      });

      if (!("outputSchema" in def) || !def.outputSchema) {
        return undefined as OutputFor<TTools[K]>;
      }

      const structured = result.structuredContent;

      return def.outputSchema.parse(structured) as OutputFor<TTools[K]>;
    };
  }

  return protocol.handler(Object.keys(tools).reduce((p, c) => ({ ...p, [c]: createOne(c) }), {} as HandlerForTools<TTools>));
}

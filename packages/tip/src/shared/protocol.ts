import z from "zod";

export type NamelessTool<
  TIn extends z.ZodObject,
  TOut extends z.ZodObject | undefined = undefined,
> =
  TOut extends z.ZodObject
  ? {
    inputSchema: TIn;
    outputSchema: TOut;
  } : {
    inputSchema: TIn;
    outputSchema?: undefined;
  };

const empty = z.object({});

export function tool<
  TIn extends z.ZodObject = typeof empty,
  TOut extends z.ZodObject | undefined = undefined,
>(inputSchema?: TIn, outputSchema?: TOut): NamelessTool<TIn, TOut> {
  return {
    inputSchema: (inputSchema ?? empty) as TIn,
    ...(outputSchema ? { outputSchema } : {}),
  } as NamelessTool<TIn, TOut>;
}

type Exact<A, B> = A extends B ? B extends A ? A : never : never;

export type ProtocolTools = Record<
  string,
  NamelessTool<z.ZodObject, z.ZodObject | undefined>
>;

export type ToolHandlerFactory = <
  TProtocolTools extends ProtocolTools,
  THandler extends HandlerForTools<TProtocolTools>
>(handler: Exact<THandler, HandlerForTools<TProtocolTools>>) => THandler;

export type Protocol<TTools extends ProtocolTools> = {
  readonly tools: TTools;
  handler<THandler extends HandlerForTools<TTools>>(handler: Omit<THandler, '$protocol'>): THandler;
};

export function createProtocol<
  const TTools extends ProtocolTools
>(
  factory: (ctx: { tool: typeof tool; z: typeof z }) => TTools,
): Protocol<TTools> {
  const protocol: Protocol<TTools> = {
    tools: factory({ tool, z }),
    handler<THandler extends HandlerForTools<TTools>>(handler: Omit<THandler, '$protocol'>): THandler {
      return Object.assign(handler, { $protocol: protocol }) as THandler;
    }
  };
  return protocol;
}

export type InputFor<TTool extends NamelessTool<z.ZodObject, any>> =
  z.input<TTool["inputSchema"]>;

export type OutputFor<TTool extends NamelessTool<any, any>> =
  TTool extends { outputSchema: infer TSchema extends z.ZodObject }
  ? z.output<TSchema>
  : void;

export type HandlerForTools<TTools extends ProtocolTools> = {
  [K in keyof TTools]: (
    input: InputFor<TTools[K]>
  ) => Promise<OutputFor<TTools[K]>>;
} & { readonly $protocol: Protocol<TTools>; };

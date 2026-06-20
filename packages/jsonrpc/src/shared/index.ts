import {
  type Disposable,
  ErrorCodes,
  NotificationType,
  RequestType,
  ResponseError,
} from "vscode-jsonrpc";

export type ProtocolRequest<
  Method extends string,
  Params,
  Result,
  Error = void,
> = RequestType<Params, Result, Error> & {
  readonly method: Method;
  readonly __kind?: "request";
  readonly __params: Params;
  readonly __result: Result;
  readonly __error: Error;
};

export type ProtocolNotification<
  Method extends string,
  Params,
> = NotificationType<Params> & {
  readonly method: Method;
  readonly __kind?: "notification";
  readonly __params: Params;
};

export type ProtocolDefinition = {
  clientToServer: ProtocolDirection;
  serverToClient: ProtocolDirection;
  bidirectional: ProtocolDirection;
};

export interface ProtocolDirection {
  requests?: Record<string, ProtocolRequest<string, unknown, unknown, unknown>>;
  notifications?: Record<string, ProtocolNotification<string, unknown>>;
}

interface ResolvedProtocolDirection {
  requests: AnyRequest[];
  notifications: AnyNotification[];
}

type AnyRequest = ProtocolRequest<string, unknown, unknown, unknown>;
type AnyNotification = ProtocolNotification<string, unknown>;
type AnyProtocolMember = AnyRequest | AnyNotification;

type RequestsOf<Direction extends ProtocolDirection> =
  Direction["requests"] extends Record<string, AnyRequest>
  ? Direction["requests"]
  : {};
type NotificationsOf<Direction extends ProtocolDirection> =
  Direction["notifications"] extends Record<string, AnyNotification>
  ? Direction["notifications"]
  : {};
type RequestMembersOf<Direction extends ProtocolDirection> =
  Direction["requests"] extends Record<string, AnyRequest>
  ? Direction["requests"][keyof Direction["requests"]]
  : never;
type NotificationMembersOf<Direction extends ProtocolDirection> =
  Direction["notifications"] extends Record<string, AnyNotification>
  ? Direction["notifications"][keyof Direction["notifications"]]
  : never;

type UnionToIntersection<U> =
  (U extends unknown ? (arg: U) => void : never) extends ((arg: infer I) => void)
  ? I
  : never;

type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

type MethodToPath<Method extends string> =
  Method extends `${infer Head}/${infer Tail}`
  ? [Head, ...MethodToPath<Tail>]
  : [Method];

type RequestParams<T> = T extends { readonly __params: infer Params }
  ? Params
  : never;

type RequestResult<T> = T extends { readonly __result: infer Result }
  ? Result
  : never;

type NotificationParams<T> = T extends { readonly __params: infer Params }
  ? Params
  : never;

type ArgValue<Params> = Exclude<Params, void | undefined>;
type HasOptionalArg<Params> =
  [undefined] extends [Params]
    ? true
    : [void] extends [Params]
      ? true
      : false;
type Args<Params> =
  [ArgValue<Params>] extends [never]
    ? []
    : HasOptionalArg<Params> extends true
      ? [] | [ArgValue<Params>]
      : [Params];

type Sender<T> = T extends { readonly __kind?: "request" }
  ? (...args: Args<RequestParams<T>>) => Promise<RequestResult<T>>
  : T extends { readonly __kind?: "notification" }
  ? (...args: Args<NotificationParams<T>>) => void
  : never;

type RequestHandler<T> = T extends { readonly __kind?: "request" }
  ? (...args: Args<RequestParams<T>>) => RequestResult<T> | Promise<RequestResult<T>>
  : never;

type NotificationHandler<T> = T extends { readonly __kind?: "notification" }
  ? (...args: Args<NotificationParams<T>>) => void | Promise<void>
  : never;

type RequestRegistrar<T> = (handler: RequestHandler<T>) => Disposable | void;
type NotificationRegistrar<T> = (handler: NotificationHandler<T>) => Disposable | void;

type PathTree<Path extends string[], Leaf> =
  Path extends [infer Head extends string, ...infer Tail extends string[]]
  ? {
    [K in Head]: Tail extends [] ? Leaf : PathTree<Tail, Leaf>;
  }
  : never;

type RequestMembersToTree<
  Members extends AnyRequest,
  Leaf,
> = [Members] extends [never]
  ? {}
  : Simplify<
    UnionToIntersection<
      Members extends AnyRequest
        ? PathTree<
          MethodToPath<Members["method"]>,
          Leaf extends "sender"
            ? Sender<Members>
            : Leaf extends "registrar"
              ? RequestRegistrar<Members>
              : RequestHandler<Members>
        >
        : never
    >
  >;

type NotificationMembersToTree<
  Members extends AnyNotification,
  Leaf,
> = [Members] extends [never]
  ? {}
  : Simplify<
    UnionToIntersection<
      Members extends AnyNotification
        ? PathTree<
          MethodToPath<Members["method"]>,
          Leaf extends "sender"
            ? Sender<Members>
            : Leaf extends "registrar"
              ? NotificationRegistrar<Members>
              : NotificationHandler<Members>
        >
        : never
    >
  >;

export type RequestSenderTree<Members extends AnyRequest> = RequestMembersToTree<
  Members,
  "sender"
>;

export type NotificationSenderTree<
  Members extends AnyNotification,
> = NotificationMembersToTree<
  Members,
  "sender"
>;

export type RequestHandlerTree<Members extends AnyRequest> = RequestMembersToTree<
  Members,
  "handler"
>;

export type NotificationHandlerTree<Members extends AnyNotification> = NotificationMembersToTree<
  Members,
  "handler"
>;

export type RequestRegistrarTree<Members extends AnyRequest> = RequestMembersToTree<
  Members,
  "registrar"
>;

export type NotificationRegistrarTree<
  Members extends AnyNotification,
> = NotificationMembersToTree<
  Members,
  "registrar"
>;

type OutboundRequests<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> = Role extends "client"
  ? RequestMembersOf<Definition["clientToServer"]> | RequestMembersOf<Definition["bidirectional"]>
  : RequestMembersOf<Definition["serverToClient"]> | RequestMembersOf<Definition["bidirectional"]>;

type OutboundNotifications<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> = Role extends "client"
  ? NotificationMembersOf<Definition["clientToServer"]> | NotificationMembersOf<Definition["bidirectional"]>
  : NotificationMembersOf<Definition["serverToClient"]> | NotificationMembersOf<Definition["bidirectional"]>;

type InboundRequests<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> = Role extends "client"
  ? RequestMembersOf<Definition["serverToClient"]> | RequestMembersOf<Definition["bidirectional"]>
  : RequestMembersOf<Definition["clientToServer"]> | RequestMembersOf<Definition["bidirectional"]>;

type InboundNotifications<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> = Role extends "client"
  ? NotificationMembersOf<Definition["serverToClient"]> | NotificationMembersOf<Definition["bidirectional"]>
  : NotificationMembersOf<Definition["clientToServer"]> | NotificationMembersOf<Definition["bidirectional"]>;

export interface JsonRpcConnectionLike {
  sendRequest<R>(type: { method: string }, ...params: unknown[]): Promise<R>;
  sendNotification(type: { method: string }, ...params: unknown[]): void;
  onRequest(type: { method: string }, handler: (...params: unknown[]) => unknown): Disposable | void;
  onNotification(type: { method: string }, handler: (...params: unknown[]) => void): Disposable | void;
}

export interface ProtocolOutbound<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> {
  requests: RequestSenderTree<OutboundRequests<Definition, Role>>;
  notifications: NotificationSenderTree<OutboundNotifications<Definition, Role>>;
}

export interface ProtocolInbound<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> {
  requests: RequestRegistrarTree<InboundRequests<Definition, Role>>;
  notifications: NotificationRegistrarTree<InboundNotifications<Definition, Role>>;
}

export class ProtocolPeer<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> {
  readonly protocol: ProtocolInstance<Definition>;
  readonly connection: JsonRpcConnectionLike;
  readonly outbound: ProtocolOutbound<Definition, Role>;
  readonly inbound: ProtocolInbound<Definition, Role>;

  constructor(
    protocol: ProtocolInstance<Definition>,
    connection: JsonRpcConnectionLike,
    outbound: ProtocolOutbound<Definition, Role>,
    inbound: ProtocolInbound<Definition, Role>,
  ) {
    this.protocol = protocol;
    this.connection = connection;
    this.outbound = outbound;
    this.inbound = inbound;
  }
}

export type ProtocolInitializer<
  Definition extends ProtocolDefinition,
  Role extends "client" | "server",
> = (peer: ProtocolPeer<Definition, Role>) => void;

export type ProtocolInstance<Definition extends ProtocolDefinition> = Definition & {
  client(
    connection: JsonRpcConnectionLike,
    initialize?: ProtocolInitializer<Definition, "client">,
  ): ProtocolPeer<Definition, "client">;
  server(
    connection: JsonRpcConnectionLike,
    initialize?: ProtocolInitializer<Definition, "server">,
  ): ProtocolPeer<Definition, "server">;
};

export function request<const Method extends string>(method: Method) {
  return function defineRequest<Params = undefined, Result = void, Error = undefined>() {
    return new RequestType<Params, Result, Error>(method) as ProtocolRequest<
      Method,
      Params,
      Result,
      Error
    >;
  };
}

export function notification<const Method extends string>(method: Method) {
  return function defineNotification<Params = undefined>() {
    return new NotificationType<Params>(method) as ProtocolNotification<Method, Params>;
  };
}

export function jsonrpcError<Data = unknown>(
  code: number,
  message: string,
  data?: Data,
) {
  return new ResponseError<Data>(code, message, data);
}

export function invalidParamsError<Data = unknown>(
  data?: Data,
  message = "Invalid params",
) {
  return jsonrpcError(ErrorCodes.InvalidParams, message, data);
}

export interface ProtocolFactories {
  request: typeof request;
  notification: typeof notification;
}

export function createProtocol<const Definition extends ProtocolDefinition>(
  factory: (factories: ProtocolFactories) => Definition,
): ProtocolInstance<Definition>;
export function createProtocol<const Definition extends ProtocolDefinition>(
  definition: Definition,
): ProtocolInstance<Definition>;
export function createProtocol<const Definition extends ProtocolDefinition>(
  definitionOrFactory: Definition | ((factories: ProtocolFactories) => Definition),
): ProtocolInstance<Definition> {
  const resolvedDefinition = normalizeProtocolDefinition(
    typeof definitionOrFactory === "function"
      ? definitionOrFactory({
        request,
        notification,
      })
      : definitionOrFactory,
  );

  const instance = {
    ...resolvedDefinition,
    client(connection, initialize) {
      const peer = createPeer(
        instance as ProtocolInstance<Definition>,
        connection,
        "client",
        outboundFor(resolvedDefinition, "client"),
        inboundFor(resolvedDefinition, "client"),
      ) as ProtocolPeer<Definition, "client">;
      initialize?.(peer);
      return peer;
    },
    server(connection, initialize) {
      const peer = createPeer(
        instance as ProtocolInstance<Definition>,
        connection,
        "server",
        outboundFor(resolvedDefinition, "server"),
        inboundFor(resolvedDefinition, "server"),
      ) as ProtocolPeer<Definition, "server">;
      initialize?.(peer);
      return peer;
    },
  } as ProtocolInstance<Definition>;

  return instance;
}

function outboundFor(definition: ProtocolDefinition, role: "client" | "server") {
  return role === "client"
    ? {
      requests: mergeMembers(
        definition.clientToServer.requests,
        definition.bidirectional.requests,
      ),
      notifications: mergeMembers(
        definition.clientToServer.notifications,
        definition.bidirectional.notifications,
      ),
    }
    : {
      requests: mergeMembers(
        definition.serverToClient.requests,
        definition.bidirectional.requests,
      ),
      notifications: mergeMembers(
        definition.serverToClient.notifications,
        definition.bidirectional.notifications,
      ),
    };
}

function inboundFor(definition: ProtocolDefinition, role: "client" | "server") {
  return role === "client"
    ? {
      requests: mergeMembers(
        definition.serverToClient.requests,
        definition.bidirectional.requests,
      ),
      notifications: mergeMembers(
        definition.serverToClient.notifications,
        definition.bidirectional.notifications,
      ),
    }
    : {
      requests: mergeMembers(
        definition.clientToServer.requests,
        definition.bidirectional.requests,
      ),
      notifications: mergeMembers(
        definition.clientToServer.notifications,
        definition.bidirectional.notifications,
      ),
    };
}

function normalizeProtocolDefinition(definition: ProtocolDefinition): ProtocolDefinition {
  return {
    clientToServer: {
      requests: definition.clientToServer.requests || {},
      notifications: definition.clientToServer.notifications || {},
    },
    serverToClient: {
      requests: definition.serverToClient.requests || {},
      notifications: definition.serverToClient.notifications || {},
    },
    bidirectional: {
      requests: definition.bidirectional.requests || {},
      notifications: definition.bidirectional.notifications || {},
    },
  };
}

function createPeer(
  protocol: ProtocolInstance<any>,
  connection: JsonRpcConnectionLike,
  role: "client" | "server",
  outbound: ResolvedProtocolDirection,
  inbound: ResolvedProtocolDirection,
) {
  const outboundApi = {
    requests: createTree(
      outbound.requests,
      (definition) => (...params: unknown[]) => connection.sendRequest(definition, ...params),
    ),
    notifications: createTree(
      outbound.notifications,
      (definition) => (...params: unknown[]) => connection.sendNotification(definition, ...params),
    ),
  };

  const inboundApi = {
    requests: createTree(
      inbound.requests,
      (definition) => (handler: (...params: unknown[]) => unknown) =>
        connection.onRequest(definition, (...params) => handler(...params)),
    ),
    notifications: createTree(
      inbound.notifications,
      (definition) => (handler: (...params: unknown[]) => void) =>
        connection.onNotification(definition, (...params) => {
          void handler(...params);
        }),
    ),
  };

  return new ProtocolPeer(
    protocol,
    connection,
    outboundApi as ProtocolOutbound<any, any>,
    inboundApi as ProtocolInbound<any, any>,
  );
}

function mergeMembers<T extends AnyProtocolMember>(
  ...records: Array<Record<string, T> | undefined>
) {
  return records.flatMap((record) => Object.values(record ?? {}));
}

function createTree<T extends AnyProtocolMember>(
  definitions: T[],
  createLeaf: (definition: T) => unknown,
) {
  const root: Record<string, unknown> = {};

  for (const definition of definitions) {
    const path = definition.method.split("/");
    let cursor = root;

    for (const segment of path.slice(0, -1)) {
      cursor[segment] ??= {};
      cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[path.at(-1)!] = createLeaf(definition);
  }

  return root;
}

export type InferRequestParams<T extends AnyRequest> = RequestParams<T>;
export type InferRequestResult<T extends AnyRequest> = RequestResult<T>;
export type InferNotificationParams<T extends AnyNotification> = NotificationParams<T>;

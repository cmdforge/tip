export const tipServerSchemaUrl =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

export const tipServerStartupMetaKey = "io.github.cmdforge.tip/startup";

export interface TipServerStartupOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export function getTipServerStartupMeta(server: {
  _meta?: Record<string, unknown>;
}): TipServerStartupOptions | undefined {
  const meta = server._meta?.[tipServerStartupMetaKey];
  if (!isRecord(meta)) {
    return undefined;
  }

  const { command, args, cwd, env } = meta;
  if (typeof command !== "string" || command.length === 0) {
    return undefined;
  }

  if (args !== undefined && !isStringArray(args)) {
    return undefined;
  }

  if (cwd !== undefined && typeof cwd !== "string") {
    return undefined;
  }

  if (env !== undefined && !isStringRecord(env)) {
    return undefined;
  }

  return {
    command,
    ...(args ? { args } : {}),
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
  };
}

export function mergeTipServerStartupMeta<
  TServer extends {
    _meta?: Record<string, unknown>;
  },
>(
  server: TServer,
  startup: TipServerStartupOptions,
): TServer & {
  _meta: Record<string, unknown>;
} {
  return {
    ...server,
    _meta: {
      ...(server._meta ?? {}),
      [tipServerStartupMetaKey]: {
        command: startup.command,
        ...(startup.args ? { args: startup.args } : {}),
        ...(startup.cwd ? { cwd: startup.cwd } : {}),
        ...(startup.env ? { env: startup.env } : {}),
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => item === undefined || typeof item === "string")
  );
}

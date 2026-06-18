import { spawn } from "node:child_process";
import {
  getTipTransportForUrl,
  type TipConnectionUrl,
  type TipClientTransport,
  type TipUiOpenOptions,
} from "../shared/index.js";

export type TipDirectConnectionSource =
  | {
    type: "url";
    url: TipConnectionUrl;
  }
  | {
    type: "http";
    url: TipConnectionUrl;
  }
  | {
    type: "ws";
    url: TipConnectionUrl;
  };

export type TipStdioConnectionSource = {
  type: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export type TipConnectionSource =
  | TipDirectConnectionSource
  | TipStdioConnectionSource;

export type TipResolvedConnection = {
  url: TipConnectionUrl;
  transport: TipClientTransport;
  close(): Promise<void>;
};

export function createTipUiOpenCommand(options: TipUiOpenOptions): {
  command: string;
  args: string[];
} {
  return {
    command: options.command ?? "pnpm",
    args: options.args ?? [
      "dlx",
      "github:cmdforge/tip",
      "ui",
      "open",
      options.url,
    ],
  };
}

export async function resolveTipConnection(
  source: TipConnectionSource,
): Promise<TipResolvedConnection> {
  if (source.type === "stdio") {
    throw new Error(
      "stdio TIP connection bridging is not implemented yet. Start with an http/ws URL or add a stdio bridge in packages/tip/server.",
    );
  }

  const url = source.url;

  return {
    url,
    transport: getTipTransportForUrl(url),
    async close() {
      return;
    },
  };
}

export async function openTipUi(options: TipUiOpenOptions): Promise<void> {
  const { command, args } = createTipUiOpenCommand(options);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("spawn", () => resolve());
  });
}

export async function openTipUiForConnection(
  source: TipConnectionSource,
  options: Omit<TipUiOpenOptions, "url"> = {},
): Promise<TipResolvedConnection> {
  const connection = await resolveTipConnection(source);
  await openTipUi({ ...options, url: connection.url });
  return connection;
}

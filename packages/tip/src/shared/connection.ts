export type TipConnectionUrl = string;

export type TipClientTransport = "streamable-http" | "websocket";

export type TipUiOpenOptions = {
  url: TipConnectionUrl;
  cwd?: string;
  env?: Record<string, string | undefined>;
  command?: string;
  args?: string[];
};

export function getTipTransportForUrl(url: TipConnectionUrl): TipClientTransport {
  const protocol = new URL(url).protocol;

  if (protocol === "http:" || protocol === "https:") {
    return "streamable-http";
  }

  if (protocol === "ws:" || protocol === "wss:") {
    return "websocket";
  }

  throw new Error(`Unsupported TIP server URL protocol: ${protocol}`);
}

import createClient from "openapi-fetch";
import type { paths } from "../shared/index.js";

export function createRegistryClient(fetch?: typeof globalThis.fetch) {
  return createClient<paths>({
    baseUrl: "https://registry.modelcontextprotocol.io",
    ...(fetch ? { fetch } : {}),
  });
}

export const registryClient = createRegistryClient();

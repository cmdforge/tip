import { registryClient } from "./registry-client.js";
import { ServerListResponse } from '../shared/registry/index.js';
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface GetAllServersOptions {
  cacheDir?: string;
  client?: Pick<typeof registryClient, "GET">;
}

export async function getAllServers(options: GetAllServersOptions = {}) {
  const client = options.client ?? registryClient;
  const dir = options.cacheDir ?? path.join(os.homedir(), '.cmdforge/tip-manager');
  const file = path.join(dir, 'registry.json');
  const servers: ServerListResponse['servers'] = [];

  if (fs.existsSync(file)) {
    const contents = await readFile(file, { encoding: 'utf-8' });
    return JSON.parse(contents) as typeof servers;
  }

  let cursor: string | undefined;
  do {
    const { data, error } = await client.GET('/v0.1/servers', {
      params: {
        query: {
          limit: 100,
          ...(cursor ? { cursor } : {})
        }
      }
    });

    if (error) assert.fail(JSON.stringify(error, null, ' '));
    if (data.servers) servers.push(...data.servers);

    cursor = data.metadata?.nextCursor;

  } while (cursor);

  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(servers, null, 2));

  return servers;
}

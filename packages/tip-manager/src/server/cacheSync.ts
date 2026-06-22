import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProtocolPeer } from '@cmdforge/jsonrpc';
import type { ManagerProtocol } from '../shared/protocol.js';
import { paths } from './utils.js';
import { registryClient } from './registry-client.js';

// Starts a background cache sync routine for the manager daemon.
// Accepts an optional server-side peer (for later notification use).
export function startCacheSync(peer?: ProtocolPeer<ManagerProtocol, 'server'>) {
  void (async () => {
    const registry = await paths.registry();
    const official = await paths.official();
    const syncFilePath = await paths.officialSync();

    try {
      // Ensure base folders exist
      await fs.mkdir(official, { recursive: true });

      // Read existing sync metadata if present; if present, subtract 5 minutes
      let updated_since: string | undefined = undefined;
      try {
        const raw = await fs.readFile(syncFilePath, 'utf8');
        const obj = JSON.parse(raw) as { updated_since?: string } | null;
        if (obj && typeof obj.updated_since === 'string') {
          try {
            const ms = Date.parse(obj.updated_since);
            if (!Number.isNaN(ms)) {
              const fiveMin = 5 * 60 * 1000;
              updated_since = new Date(ms - fiveMin).toISOString();
            }
          } catch {
            // ignore parse errors
          }
        }
      } catch (err) {
        // ignore if missing
      }

      // Track the maximum updatedAt observed in entries
      let maxUpdatedAtMs: number | undefined = undefined;

      let cursor: string | undefined = undefined;
      const seenCursors = new Set<string>();

      do {
        const { data, error } = await registryClient.GET('/v0.1/servers', {
          params: {
            query: {
              limit: 100,
              ...(cursor ? { cursor } : {}),
              ...(updated_since ? { updated_since } : {}),
            },
          },
        });

        if (error) {
          console.error('registry fetch error:', error);
          break;
        }

        if (!data?.servers) break;

        for (const entry of data.servers) {
          try {
            // API returns entries with metadata and a server object
            const s = (entry as any).server ?? entry;
            const meta = (entry as any)._meta ?? {};
            const name = encodeURIComponent(s.name);
            const version = encodeURIComponent(s.version ?? '');
            const dir = path.join(official, name);
            await fs.mkdir(dir, { recursive: true });

            const entryObj = (entry as any);
            const versionPath = path.join(dir, `${version}.json`);
            // Store the full registry entry (including _meta and server) as-is
            await fs.writeFile(versionPath, JSON.stringify(entryObj, null, ' '), 'utf8');

            const officialMeta = meta?.['io.modelcontextprotocol.registry/official'];
            const isLatest = !!(officialMeta?.isLatest);

            if (officialMeta && typeof officialMeta.updatedAt === 'string') {
              const ms = Date.parse(officialMeta.updatedAt);
              if (!Number.isNaN(ms)) {
                if (maxUpdatedAtMs === undefined || ms > maxUpdatedAtMs) {
                  maxUpdatedAtMs = ms;
                }
              }
            }

            if (isLatest) {
              const latestPath = path.join(official, `${name}.json`);
              await fs.writeFile(latestPath, JSON.stringify(entryObj, null, ' '), 'utf8');
            }
          } catch (err) {
            // Log per-server errors and continue
            console.error('Failed to write server file:', err);
          }
        }

        const nextCursor = data.metadata?.nextCursor as string | undefined;
        if (!nextCursor) {
          cursor = undefined;
          continue;
        }

        if (seenCursors.has(nextCursor)) {
          throw new Error(`Registry pagination repeated cursor: ${nextCursor}`);
        }

        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (cursor);

      // Compute new updated_since: use maxUpdatedAt if available, otherwise fallback to yesterday
      let newUpdatedSince: string | undefined = undefined;
      if (maxUpdatedAtMs !== undefined) {
        newUpdatedSince = new Date(maxUpdatedAtMs).toISOString();
      }

      // Fallback: if we couldn't determine updatedAt, use yesterday
      if (!newUpdatedSince) {
        newUpdatedSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      }

      const syncObj = { updated_since: newUpdatedSince };
      try {
        await fs.writeFile(syncFilePath, JSON.stringify(syncObj, null, ' '), 'utf8');
      } catch (err) {
        console.error('Failed to write sync file:', err);
      }

      // Optionally notify peers that official servers are ready in future implementation
      // e.g. peer?.outbound.notifications.officialServersReady({ count: ???, loadedAt: new Date().toISOString() })

      console.log('tip-manager cacheSync: completed sync to', official);

      // Populate manager's cached servers state by reading the cache directories
      try {
        const map: Record<string, { latest?: any; versions: any[] }> = {};
        const entries = await fs.readdir(official, { withFileTypes: true });

        for (const dirent of entries) {
          if (dirent.isDirectory()) {
            const encodedName = dirent.name;
            const key = decodeURIComponent(encodedName);
            const dirPath = path.join(official, encodedName);
            const files = await fs.readdir(dirPath);
            const versions: any[] = [];

            for (const f of files) {
              if (f.endsWith('.json')) {
                try {
                  const raw = await fs.readFile(path.join(dirPath, f), 'utf8');
                  versions.push(JSON.parse(raw));
                } catch (err) {
                  console.error('Failed to read version file:', err);
                }
              }
            }

            // Try to load latest from top-level file
            let latest: any | undefined = undefined;
            const latestPath = path.join(official, `${encodedName}.json`);
            try {
              const rawLatest = await fs.readFile(latestPath, 'utf8');
              latest = JSON.parse(rawLatest);
            } catch {
              // ignore missing
            }

            map[key] = { latest, versions };
          }
        }

        try {
          const { getManagerInstance } = await import('./manager.js');
          const manager = getManagerInstance();
          if (typeof manager.setCachedServers === 'function') {
          manager.setCachedServers(map as unknown as Record<string, { latest?: import('../shared/index.js').ServerResponse; versions: import('../shared/index.js').ServerResponse[] }>, null);
          }
        } catch (err) {
          console.error('Failed to update manager cached servers state:', err);
        }
      } catch (err) {
        console.error('Failed to populate cached servers from disk:', err);
      }

    } catch (error) {
      console.error('tip-manager cacheSync failed:', error);

      // Attempt to still populate manager state from any existing on-disk cache
      try {
        const map: Record<string, { latest?: any; versions: any[] }> = {};
        const entries = await fs.readdir(official, { withFileTypes: true });

        for (const dirent of entries) {
          if (dirent.isDirectory()) {
            const encodedName = dirent.name;
            const key = decodeURIComponent(encodedName);
            const dirPath = path.join(official, encodedName);
            const files = await fs.readdir(dirPath);
            const versions: any[] = [];

            for (const f of files) {
              if (f.endsWith('.json')) {
                try {
                  const raw = await fs.readFile(path.join(dirPath, f), 'utf8');
                  versions.push(JSON.parse(raw));
                } catch (err) {
                  // ignore
                }
              }
            }

            let latest: any | undefined = undefined;
            const latestPath = path.join(official, `${encodedName}.json`);
            try {
              const rawLatest = await fs.readFile(latestPath, 'utf8');
              latest = JSON.parse(rawLatest);
            } catch {
              // ignore
            }

            map[key] = { latest, versions };
          }
        }

        try {
          const { getManagerInstance } = await import('./manager.js');
          const manager = getManagerInstance();
          if (typeof manager.setCachedServers === 'function') {
          manager.setCachedServers(map as unknown as Record<string, { latest?: import('../shared/index.js').ServerResponse; versions: import('../shared/index.js').ServerResponse[] }>, String(error instanceof Error ? error.message : String(error)));
          }
        } catch (err) {
          console.error('Failed to update manager cached servers state after error:', err);
        }
      } catch (err) {
        console.error('Failed to populate cached servers from disk after error:', err);
      }
    }
  })();
}

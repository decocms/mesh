/**
 * Local-dev daemon lifecycle manager.
 *
 * Inline-starts the local-dev MCP server in the same process
 * instead of spawning a separate binary.
 */

// Static type import so knip detects the dependency (runtime uses dynamic import)
import type {} from "@decocms/local-dev";

const DEFAULT_PORT = 4201;

/** Minimal interface matching LocalDevServer from @decocms/local-dev */
export interface LocalDevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  port: number;
  rootPath: string;
}

/**
 * Start the local-dev MCP server inline for the given folder.
 *
 * If local-dev is already running on the port **for the same folder**,
 * returns null (caller should treat null as "already running, nothing to manage").
 *
 * If a different folder owns this port, proceeds to start anyway —
 * the server will auto-find the next available port via EADDRINUSE retry.
 */
export async function startLocalDev(
  folder: string,
  port: number = DEFAULT_PORT,
): Promise<LocalDevServer | null> {
  // If already running on this port for the same folder, nothing to do
  const existingRoot = await probeLocalDev(port);
  if (existingRoot === folder) {
    return null;
  }

  // Use opaque dynamic import to prevent tsc from resolving local-dev's .ts files
  const moduleName = "@decocms/local-dev";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* @vite-ignore */ moduleName)) as any;
  const server = mod.createLocalDevServer({
    rootPath: folder,
    port,
  }) as LocalDevServer;
  await server.start();
  return server;
}

/**
 * Stop a managed local-dev server instance.
 *
 * No-op if server is null.
 */
export async function stopLocalDev(
  server: LocalDevServer | null,
): Promise<void> {
  if (!server) return;
  await server.stop();
}

/**
 * Probe whether a local-dev daemon is alive on the given port.
 * Returns the root path of the running instance, or null if nothing is running.
 */
async function probeLocalDev(
  port: number = DEFAULT_PORT,
): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost:${port}/_ready`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { root?: string };
    return data.root ?? null;
  } catch {
    return null;
  }
}

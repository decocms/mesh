import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Subprocess } from "bun";

const CADDY_ADMIN = "http://localhost:2019";
const MAP_DIR = join(homedir(), ".studio-worktrees");
const MAP_FILE = join(MAP_DIR, "proxy-map.json");
const CADDY_SERVER_ID = "studio-worktrees";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WorktreeContext {
  slug: string;
  /** Find the next free port starting from `start`. Tracks allocated ports
   *  internally so sequential calls never return the same port. */
  findFreePort(start: number): Promise<number>;
}

export interface WorktreeHandle {
  /** The port Caddy should reverse-proxy to (e.g. your HTTP server). */
  port: number;
  /** The child process to await / kill on cleanup. */
  process: Subprocess;
}

export type StartFn = (ctx: WorktreeContext) => Promise<WorktreeHandle>;

// ---------------------------------------------------------------------------
// Proxy-map persistence
// ---------------------------------------------------------------------------

interface MapEntry {
  port: number;
  pid: number;
}

type ProxyMap = Record<string, MapEntry>;

function readMap(): ProxyMap {
  if (!existsSync(MAP_FILE)) return {};
  try {
    return JSON.parse(readFileSync(MAP_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeMap(map: ProxyMap): void {
  if (!existsSync(MAP_DIR)) mkdirSync(MAP_DIR, { recursive: true });
  writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Port detection (IPv4 + IPv6)
// ---------------------------------------------------------------------------

function probePort(hostname: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    Bun.connect({
      hostname,
      port,
      socket: {
        open(socket) {
          socket.end();
          resolve(false); // something is listening → in use
        },
        data() {},
        error() {
          resolve(true);
        },
        connectError() {
          resolve(true);
        },
      },
    }).catch(() => resolve(true));
  });
}

async function isPortFree(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    probePort("127.0.0.1", port),
    probePort("::1", port),
  ]);
  return v4 && v6;
}

// ---------------------------------------------------------------------------
// Caddy admin API helpers
// ---------------------------------------------------------------------------

async function assertCaddyRunning(): Promise<void> {
  try {
    const res = await fetch(`${CADDY_ADMIN}/config/`);
    if (!res.ok) throw new Error();
  } catch {
    console.error(`
❌ Caddy is not running. One-time setup required:

  brew install caddy
  sudo caddy start

Then re-run dev:worktree.
`);
    process.exit(1);
  }
}

async function ensureCaddyServer(): Promise<void> {
  const res = await fetch(
    `${CADDY_ADMIN}/config/apps/http/servers/${CADDY_SERVER_ID}`,
  );
  if (res.ok) return;

  const currentRes = await fetch(`${CADDY_ADMIN}/config/`);
  const current = (currentRes.ok ? await currentRes.json() : null) ?? {};

  const merged = {
    ...current,
    apps: {
      ...(current.apps ?? {}),
      http: {
        ...(current.apps?.http ?? {}),
        servers: {
          ...(current.apps?.http?.servers ?? {}),
          [CADDY_SERVER_ID]: { listen: [":80"], routes: [] },
        },
      },
    },
  };

  const loadRes = await fetch(`${CADDY_ADMIN}/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });

  if (!loadRes.ok) {
    const text = await loadRes.text();
    throw new Error(`Failed to bootstrap Caddy server: ${text}`);
  }

  console.log(`✓ Bootstrapped Caddy server '${CADDY_SERVER_ID}' on :80`);
}

async function registerRoute(slug: string, port: number): Promise<void> {
  await removeRoute(slug);

  const route = {
    "@id": `worktree-${slug}`,
    match: [{ host: [`${slug}.localhost`] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: `localhost:${port}` }],
      },
    ],
  };

  const res = await fetch(
    `${CADDY_ADMIN}/config/apps/http/servers/${CADDY_SERVER_ID}/routes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to register Caddy route: ${text}`);
  }
}

async function removeRoute(slug: string): Promise<void> {
  await fetch(`${CADDY_ADMIN}/id/worktree-${slug}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function startWorktree(
  slug: string,
  start: StartFn,
): Promise<void> {
  // 1. Clean stale entries and collect used ports
  const map = readMap();
  const usedPorts = new Set<number>();

  for (const [key, entry] of Object.entries(map)) {
    if (isProcessAlive(entry.pid)) {
      usedPorts.add(entry.port);
    } else {
      console.log(`🧹 Cleaned stale entry for '${key}'`);
      await removeRoute(key);
      delete map[key];
    }
  }
  writeMap(map);

  // 2. Set up Caddy
  await assertCaddyRunning();
  await ensureCaddyServer();

  // 3. Build context and call the start callback
  const ctx: WorktreeContext = {
    slug,
    async findFreePort(start: number): Promise<number> {
      for (let p = start; p < start + 1000; p++) {
        if (usedPorts.has(p)) continue;
        if (await isPortFree(p)) {
          usedPorts.add(p);
          return p;
        }
      }
      throw new Error(`No free port found starting from ${start}`);
    },
  };

  const handle = await start(ctx);

  // 4. Register Caddy route and persist
  await registerRoute(slug, handle.port);
  map[slug] = { port: handle.port, pid: process.pid };
  writeMap(map);

  console.log(`✅ http://${slug}.localhost is live`);

  // 5. Lifecycle — cleanup on exit
  async function cleanup(): Promise<void> {
    console.log(`\n🧹 Cleaning up ${slug}...`);
    try {
      await removeRoute(slug);
    } catch (e) {
      console.warn("Warning: failed to remove Caddy route:", e);
    }
    const current = readMap();
    delete current[slug];
    writeMap(current);
    handle.process.kill();
    process.exit(0);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await handle.process.exited;
  await cleanup();
}

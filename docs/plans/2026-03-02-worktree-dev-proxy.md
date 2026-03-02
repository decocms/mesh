# Worktree Dev Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a generic `dev:worktree` script that routes `http://<WORKTREE_SLUG>.localhost` (port 80) to the dev server via Caddy, with a thin `dev:conductor` adapter that injects the slug from `CONDUCTOR_WORKSPACE_NAME`.

**Architecture:** A Bun TypeScript script (`scripts/dev-worktree.ts`) orchestrates port discovery, Caddy Admin API route registration, child process lifecycle, and cleanup. A shared mapping file at `~/.studio-worktrees/proxy-map.json` tracks running worktrees. `dev:conductor` is a one-liner that sets `WORKTREE_SLUG` and delegates to `dev:worktree`.

**Tech Stack:** Bun (TypeScript, native fetch, Bun.spawn), Caddy (Admin API on localhost:2019), Vite (hmr config)

---

### Task 1: Update vite.config.ts for explicit HMR host

**Files:**
- Modify: `apps/mesh/vite.config.ts`

When the page loads from `http://dakar.localhost` (port 80 via Caddy), Vite's injected HMR client needs to know to connect directly to `localhost:VITE_PORT` rather than trying `dakar.localhost:80`. We set this explicitly.

**Step 1: Edit vite.config.ts server block**

Change the `server` block from:
```typescript
server: {
  port: parseInt(process.env.VITE_PORT || "4000", 10),
  hmr: {
    overlay: true,
  },
},
```

To:
```typescript
server: {
  port: parseInt(process.env.VITE_PORT || "4000", 10),
  hmr: {
    overlay: true,
    host: "localhost",
    clientPort: parseInt(process.env.VITE_PORT || "4000", 10),
  },
},
```

This tells the browser's HMR client to connect to `ws://localhost:VITE_PORT` directly, bypassing Caddy. Since it's all on localhost, this always works regardless of the subdomain the page was served from.

**Step 2: Verify no type errors**

```bash
bun run check
```

Expected: no errors related to vite.config.ts

**Step 3: Commit**

```bash
git add apps/mesh/vite.config.ts
git commit -m "feat(dev): configure vite HMR to use explicit localhost for worktree proxy"
```

---

### Task 2: Write the dev-worktree script

**Files:**
- Create: `scripts/dev-worktree.ts`

This is the core script. It:
1. Reads `WORKTREE_SLUG` env var (errors clearly if missing)
2. Reads/writes `~/.studio-worktrees/proxy-map.json`
3. Stale-entry detection: if mapping has a PID that's no longer alive, clears it
4. Finds two free ports (PORT for Hono, VITE_PORT for Vite)
5. Ensures Caddy Admin API is reachable; prints setup instructions and exits if not
6. Bootstraps the `studio-worktrees` Caddy server if it doesn't exist yet
7. Registers the Caddy route for this slug
8. Starts the dev child process with PORT and VITE_PORT env vars
9. On exit (SIGINT/SIGTERM/child exit): removes Caddy route, removes mapping entry, exits

**Step 1: Create the script**

```typescript
#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CADDY_ADMIN = "http://localhost:2019";
const MAP_DIR = join(homedir(), ".studio-worktrees");
const MAP_FILE = join(MAP_DIR, "proxy-map.json");
const CADDY_SERVER_ID = "studio-worktrees";

interface WorktreeEntry {
  port: number;
  vitePort: number;
  pid: number;
}

type ProxyMap = Record<string, WorktreeEntry>;

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

async function findFreePort(start: number, usedPorts: Set<number>): Promise<number> {
  for (let port = start; port < start + 1000; port++) {
    if (usedPorts.has(port)) continue;
    const server = Bun.listen({ hostname: "0.0.0.0", port, socket: {} as never }).catch?.();
    // Use a TCP probe instead
    try {
      const s = Bun.listen({
        hostname: "127.0.0.1",
        port,
        socket: {
          open() {},
          data() {},
          close() {},
          error() {},
        },
      });
      s.stop();
      return port;
    } catch {
      // port in use
    }
  }
  throw new Error(`No free port found starting from ${start}`);
}

async function caddyGet(path: string): Promise<Response> {
  return fetch(`${CADDY_ADMIN}${path}`);
}

async function caddyPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${CADDY_ADMIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function caddyDelete(path: string): Promise<void> {
  await fetch(`${CADDY_ADMIN}${path}`, { method: "DELETE" });
}

async function assertCaddyRunning(): Promise<void> {
  try {
    const res = await caddyGet("/config/");
    if (!res.ok) throw new Error();
  } catch {
    console.error(`
❌ Caddy is not running. One-time setup required:

  brew install caddy
  brew services start caddy

Then re-run dev:worktree.
`);
    process.exit(1);
  }
}

async function ensureCaddyServer(): Promise<void> {
  // Check if our server already exists
  const res = await caddyGet(`/config/apps/http/servers/${CADDY_SERVER_ID}`);
  if (res.ok) return;

  // Bootstrap the server
  const bootstrapRes = await caddyPost(`/config/apps/http/servers/${CADDY_SERVER_ID}`, {
    listen: [":80"],
    routes: [],
  });
  if (!bootstrapRes.ok) {
    const text = await bootstrapRes.text();
    throw new Error(`Failed to bootstrap Caddy server: ${text}`);
  }
  console.log(`✓ Bootstrapped Caddy server '${CADDY_SERVER_ID}' on :80`);
}

async function registerRoute(slug: string, port: number): Promise<void> {
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
  const res = await caddyPost(
    `/config/apps/http/servers/${CADDY_SERVER_ID}/routes`,
    route,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to register Caddy route: ${text}`);
  }
}

async function removeRoute(slug: string): Promise<void> {
  await caddyDelete(`/id/worktree-${slug}`);
}

async function main() {
  const slug = process.env.WORKTREE_SLUG;
  if (!slug) {
    console.error("❌ WORKTREE_SLUG environment variable is required.");
    process.exit(1);
  }

  // Clean stale entries and collect used ports
  const map = readMap();
  const usedPorts = new Set<number>();
  for (const [key, entry] of Object.entries(map)) {
    if (isProcessAlive(entry.pid)) {
      usedPorts.add(entry.port);
      usedPorts.add(entry.vitePort);
    } else {
      console.log(`🧹 Cleaned stale entry for '${key}'`);
      delete map[key];
    }
  }

  const port = await findFreePort(3000, usedPorts);
  usedPorts.add(port);
  const vitePort = await findFreePort(4000, usedPorts);

  console.log(`🔌 ${slug}.localhost → Hono :${port}, Vite :${vitePort}`);

  await assertCaddyRunning();
  await ensureCaddyServer();
  await registerRoute(slug, port);

  map[slug] = { port, vitePort, pid: process.pid };
  writeMap(map);

  console.log(`✅ http://${slug}.localhost is live`);

  // Resolve the repo root (two levels up from scripts/)
  const repoRoot = new URL("..", new URL(".", import.meta.url)).pathname.replace(/\/$/, "");

  const child = Bun.spawn(
    ["bun", "run", "--env-file=.env", "--cwd=apps/mesh", "dev"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        VITE_PORT: String(vitePort),
      },
      stdio: ["inherit", "inherit", "inherit"],
    },
  );

  async function cleanup() {
    console.log(`\n🧹 Cleaning up ${slug}...`);
    try {
      await removeRoute(slug);
    } catch (e) {
      console.warn("Warning: failed to remove Caddy route:", e);
    }
    const current = readMap();
    delete current[slug];
    writeMap(current);
    child.kill();
    process.exit(0);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await child.exited;
  await cleanup();
}

main().catch((e) => {
  console.error("dev:worktree error:", e);
  process.exit(1);
});
```

**Step 2: Verify the script has no TypeScript errors**

```bash
bun run check
```

Expected: no errors in `scripts/dev-worktree.ts`

**Step 3: Commit**

```bash
git add scripts/dev-worktree.ts
git commit -m "feat(dev): add dev:worktree script with Caddy reverse proxy"
```

---

### Task 3: Update package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Update the scripts block**

Replace:
```json
"dev:conductor": "PORT=$CONDUCTOR_PORT bun run --env-file=.env --cwd=apps/mesh dev",
```

With:
```json
"dev:worktree": "bun run scripts/dev-worktree.ts",
"dev:conductor": "WORKTREE_SLUG=$CONDUCTOR_WORKSPACE_NAME bun run dev:worktree",
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "feat(dev): add dev:worktree and dev:conductor adapter scripts"
```

---

### Task 4: Format and verify

**Step 1: Run formatter**

```bash
bun run fmt
```

**Step 2: Check for any lint issues**

```bash
bun run lint
```

**Step 3: Commit any formatting changes**

```bash
git add -p
git commit -m "[chore]: format dev:worktree scripts"
```

---

### Task 5: Manual smoke test

This can't be fully automated — it requires Caddy running. Document the manual test steps here as a checklist.

**Prerequisites:**
- `brew install caddy && brew services start caddy` has been run once

**Test 1: Missing WORKTREE_SLUG**
```bash
bun run scripts/dev-worktree.ts
```
Expected: `❌ WORKTREE_SLUG environment variable is required.` then exit 1

**Test 2: Caddy not running (stop temporarily)**
```bash
brew services stop caddy
WORKTREE_SLUG=test bun run scripts/dev-worktree.ts
brew services start caddy
```
Expected: clear error message with setup instructions, exit 1

**Test 3: Full happy path**
```bash
WORKTREE_SLUG=dakar bun run dev:worktree
```
Expected:
- `🔌 dakar → Hono :XXXX, Vite :YYYY` printed
- `✅ http://dakar.localhost is live` printed
- Dev server starts
- `http://dakar.localhost` loads in browser
- HMR works when editing a React component
- `~/.studio-worktrees/proxy-map.json` contains the `dakar` entry
- Ctrl+C: cleanup message, route removed from Caddy, entry removed from map file

**Test 4: dev:conductor adapter**
```bash
CONDUCTOR_WORKSPACE_NAME=dakar bun run dev:conductor
```
Expected: same as Test 3

**Test 5: Stale entry cleanup**
```bash
# Manually add a fake dead entry to ~/.studio-worktrees/proxy-map.json
echo '{"fakeslug": {"port": 3000, "vitePort": 4000, "pid": 99999999}}' > ~/.studio-worktrees/proxy-map.json
WORKTREE_SLUG=dakar bun run dev:worktree
```
Expected: `🧹 Cleaned stale entry for 'fakeslug'` printed, proceeds normally

---

## Setup Instructions (include in PR description)

One-time setup for new machines:
```bash
brew install caddy
brew services start caddy
```

Caddy will auto-start on login and runs on port 80. The `dev:worktree` script bootstraps the routing config on first run.

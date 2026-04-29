import { IFRAME_BOOTSTRAP_SCRIPT } from "../shared";

export const MAX_SSE_CLIENTS = 10;
export const REPLAY_BYTES = 4096;
export const DECO_UID = 1000;
export const DECO_GID = 1000;
export const FAST_PROBE_MS = 3000;
export const SLOW_PROBE_MS = 30000;
export const FAST_PROBE_LIMIT = 20;

/** HTML injected before </body> so the preview iframe can talk to the parent. */
export const BOOTSTRAP_SCRIPT = IFRAME_BOOTSTRAP_SCRIPT;

/**
 * Inlined at bundle time so the runtime daemon stays self-contained —
 * no upward import to `apps/mesh` or `packages/sandbox/server`.
 */
export const PACKAGE_MANAGER_DAEMON_CONFIG: Record<
  string,
  { install: string; runPrefix: string }
> = {
  // --prefer-offline: use the shared EFS npm store; skip registry round-trips
  // for already-cached packages. --no-fund/--no-audit skip network calls that
  // add latency without value in a sandbox. npm ci is intentionally avoided
  // here: it removes node_modules before reinstalling, which would wipe the
  // shared EFS symlink target before we can write the cache sentinel.
  npm: {
    install: "npm install --prefer-offline --no-fund --no-audit",
    runPrefix: "npm run",
  },
  // --frozen-lockfile: skip version resolution and refuse to mutate the
  // lockfile. Faster on warm cache; fails fast if lockfile is stale (correct
  // behaviour — stale lockfile = wrong cache key anyway).
  pnpm: { install: "pnpm install --frozen-lockfile", runPrefix: "pnpm run" },
  yarn: { install: "yarn install --frozen-lockfile", runPrefix: "yarn run" },
  bun: { install: "bun install --frozen-lockfile", runPrefix: "bun run" },
  // deno install (deno 2.x) populates DENO_DIR on the shared EFS volume so
  // subsequent sandboxes skip JSR/CDN fetches entirely. No node_modules are
  // created; linkNodeModules skips deno automatically.
  deno: { install: "deno install", runPrefix: "deno task" },
};

export const WELL_KNOWN_STARTERS = ["dev", "start"] as const;

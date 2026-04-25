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
  npm: { install: "npm install", runPrefix: "npm run" },
  pnpm: { install: "pnpm install", runPrefix: "pnpm run" },
  yarn: { install: "yarn install", runPrefix: "yarn run" },
  bun: { install: "bun install", runPrefix: "bun run" },
  deno: { install: "deno install", runPrefix: "deno task" },
};

export const WELL_KNOWN_STARTERS = ["dev", "start"] as const;

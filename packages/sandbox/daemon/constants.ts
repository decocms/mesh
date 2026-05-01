import { IFRAME_BOOTSTRAP_SCRIPT } from "../shared";

export const MAX_SSE_CLIENTS = 10;
// Per-source ring buffer cap. Real install logs (clone + npm/bun install on a
// nontrivial repo) are easily 50–200 KB; with the prior 4 KB cap, late SSE
// joiners only saw the last few package-manager lines. 256 KB covers a
// typical setup pass while keeping worst-case memory bounded (~1 MB across
// the 3–4 sources in flight at once).
export const REPLAY_BYTES = 256 * 1024;
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

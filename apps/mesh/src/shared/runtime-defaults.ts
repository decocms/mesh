export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";

export type VMRuntime = "node" | "bun" | "deno";

export const PACKAGE_MANAGER_CONFIG: Record<
  PackageManager,
  {
    install: string;
    run: (script: string) => string;
    runtime: VMRuntime;
  }
> = {
  npm: {
    install: "npm install",
    run: (s) => `npm run ${s}`,
    runtime: "node",
  },
  pnpm: {
    install: "pnpm install",
    run: (s) => `pnpm run ${s}`,
    runtime: "node",
  },
  yarn: {
    install: "yarn install",
    run: (s) => `yarn run ${s}`,
    runtime: "node",
  },
  bun: {
    install: "bun install",
    run: (s) => `bun run ${s}`,
    runtime: "bun",
  },
  deno: {
    install: "deno install",
    run: (s) => `deno task ${s}`,
    runtime: "deno",
  },
};

/**
 * Serializable version of PACKAGE_MANAGER_CONFIG for the in-VM daemon script.
 * Uses `runPrefix` (string) instead of `run` (function) so it can be JSON.stringified.
 */
export const PACKAGE_MANAGER_DAEMON_CONFIG: Record<
  PackageManager,
  { install: string; runPrefix: string }
> = {
  npm: { install: "npm install", runPrefix: "npm run" },
  pnpm: { install: "pnpm install", runPrefix: "pnpm run" },
  yarn: { install: "yarn install", runPrefix: "yarn run" },
  bun: { install: "bun install", runPrefix: "bun run" },
  deno: { install: "deno install", runPrefix: "deno task" },
};

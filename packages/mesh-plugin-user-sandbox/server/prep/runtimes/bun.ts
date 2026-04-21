/**
 * Bun runtime strategy.
 *
 * Bun's install populates `~/.bun/install/cache/` and `node_modules/` in one
 * pass; `--frozen-lockfile` refuses to resolve a new version if the lockfile
 * says otherwise — matches the determinism we want in a prep image.
 *
 * No serve-time warmup: Bun apps don't have the "lazy import via bootstrapper"
 * problem that Deno + deco does, and bundler output (if any) is project-
 * specific enough that we let it happen at thread boot.
 */

import type { Runtime } from "./types";

const BUN_RUNTIME: Runtime = {
  name: "bun",
  defaultInstallCommand: "bun install --frozen-lockfile",
};

export default BUN_RUNTIME;

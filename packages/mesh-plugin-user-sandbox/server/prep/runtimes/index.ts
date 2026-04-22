/**
 * Runtime registry + detection.
 *
 * A Runtime captures everything specific to a language/package-manager
 * ecosystem during a prep bake: default install command, and an optional
 * post-install warmup that populates on-disk caches so the first thread
 * container skips cold-start work.
 *
 * Only Deno currently has a warmup — see `./deno.ts`. Bun/Node/none are
 * install-only and defined inline below. Adding a runtime with real warmup
 * logic = new file + one detection-table entry; trivial runtimes stay here.
 */

import type { BakeLogger, ExecStepOptions } from "../docker";
import { listWorkdir } from "../probes";
import DENO from "./deno";

export type RuntimeName = "deno" | "bun" | "node" | "none";

/** Context handed to a runtime's `warmup` function. */
export interface RuntimeContext {
  builderId: string;
  prepKey: string;
  log: BakeLogger;
  /**
   * Execute a shell script inside the builder container. Thin wrapper over
   * `execIn` that pre-fills `log` and `prepKey` so runtime code stays concise.
   */
  exec: (
    script: string,
    opts: Omit<ExecStepOptions, "log" | "prepKey">,
  ) => Promise<void>;
}

export interface Runtime {
  name: RuntimeName;
  /** Override-able via `BakeInput.installCommand`. */
  defaultInstallCommand: string;
  /**
   * Optional post-install warmup. Should be `tolerateExit`-friendly: whatever
   * lands on disk before a failure still gets committed, so partial success
   * beats an empty cache.
   */
  warmup?: (ctx: RuntimeContext) => Promise<void>;
}

const BUN: Runtime = {
  name: "bun",
  // Bun's install populates `~/.bun/install/cache/` and `node_modules/` in one
  // pass; `--frozen-lockfile` refuses to resolve past the lockfile.
  defaultInstallCommand: "bun install --frozen-lockfile",
};

const NONE: Runtime = {
  name: "none",
  // Fallback when no manifest is detected. The bake is still useful — the
  // clone step pre-populated `/app`.
  defaultInstallCommand: "echo 'no manifest detected; skipping install'",
};

/**
 * Node install commands keyed by lockfile. All return a Runtime with
 * `name: "node"` — downstream only cares about the family, not the manager.
 */
const NODE_INSTALL_BY_LOCKFILE: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm install --frozen-lockfile",
  "yarn.lock": "yarn install --frozen-lockfile",
  "package-lock.json": "npm ci",
  "package.json": "npm install",
};

function nodeRuntime(installCommand: string): Runtime {
  return { name: "node", defaultInstallCommand: installCommand };
}

/**
 * Ordered detection table. First matching manifest wins, so more specific
 * markers (lockfiles, `deno.json`) come before generic ones (`package.json`).
 * Deno wins over Node when both appear: deco-sites ship `deno.json` plus a
 * stray `package.json` for editor tooling.
 */
const DETECTION_TABLE: readonly {
  readonly manifest: string;
  readonly runtime: Runtime;
}[] = [
  { manifest: "deno.json", runtime: DENO },
  { manifest: "deno.jsonc", runtime: DENO },
  { manifest: "bun.lockb", runtime: BUN },
  { manifest: "bun.lock", runtime: BUN },
  ...Object.entries(NODE_INSTALL_BY_LOCKFILE).map(([manifest, cmd]) => ({
    manifest,
    runtime: nodeRuntime(cmd),
  })),
];

export async function detectRuntime(builderId: string): Promise<Runtime> {
  const files = await listWorkdir(builderId);
  for (const { manifest, runtime } of DETECTION_TABLE) {
    if (files.has(manifest)) return runtime;
  }
  return NONE;
}

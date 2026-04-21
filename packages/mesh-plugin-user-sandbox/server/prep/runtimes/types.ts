/**
 * Runtime strategy contract.
 *
 * A Runtime captures *everything that is specific to a language/package
 * manager ecosystem* during a prep bake: which manifest files it recognises,
 * how to install dependencies, and how to warm runtime-specific on-disk
 * caches so the first real thread container skips the cold-start work.
 *
 * Each concrete runtime lives in its own file under `./runtimes/` and is
 * registered in `./index.ts`. Adding a new runtime = adding one file and
 * one entry to the registry — the bake orchestrator doesn't change.
 */

import type { BakeLogger, ExecStepOptions } from "../docker";

export type RuntimeName = "deno" | "bun" | "node" | "none";

/** Context handed to a runtime's `install` / `warmup` functions. */
export interface RuntimeContext {
  builderId: string;
  prepKey: string;
  log: BakeLogger;
  /**
   * Execute a shell script inside the builder container. Thin wrapper over
   * `execIn` that pre-fills `log` and `prepKey` so runtime code stays
   * concise.
   */
  exec: (
    script: string,
    opts: Omit<ExecStepOptions, "log" | "prepKey">,
  ) => Promise<void>;
}

export interface Runtime {
  name: RuntimeName;
  /**
   * Default install command for this runtime. Callers (e.g. the bake worker)
   * may override it via `BakeInput.installCommand`.
   */
  defaultInstallCommand: string;
  /**
   * Optional post-install warmup. Populates runtime-specific caches — module
   * cache, bundler output, generated CSS — so the first thread spawned from
   * the committed prep image skips cold-start work.
   *
   * Implementations should be `tolerateExit`-friendly: whatever lands on
   * disk before a failure still gets captured in the commit, so it's
   * strictly better than an empty cache.
   */
  warmup?: (ctx: RuntimeContext) => Promise<void>;
}

/**
 * Detects the runtime from the files present in the builder workdir. The
 * returned strategy owns install + warmup for that ecosystem.
 */
export interface RuntimeDetector {
  (files: Set<string>): Promise<Runtime | null> | Runtime | null;
}

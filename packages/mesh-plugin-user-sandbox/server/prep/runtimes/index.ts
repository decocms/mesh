/**
 * Runtime registry + detection.
 *
 * Each runtime lives in its own file and encapsulates:
 *   - which manifest files identify it,
 *   - how to install dependencies,
 *   - how to warm runtime-specific on-disk caches.
 *
 * The bake orchestrator (`../bake.ts`) never special-cases any runtime by
 * name; it asks `detectRuntime()` for a strategy and invokes the strategy's
 * `install` + `warmup` hooks. Adding a runtime = one new file + one entry
 * in the table below.
 */

import { listWorkdir } from "../probes";
import type { Runtime } from "./types";
import DENO from "./deno";
import BUN from "./bun";
import NONE from "./none";
import {
  NPM_CI_RUNTIME,
  NPM_INSTALL_RUNTIME,
  PNPM_RUNTIME,
  YARN_RUNTIME,
} from "./node";

export type { Runtime, RuntimeContext, RuntimeName } from "./types";

/**
 * Ordered detection table. The first entry whose `manifest` file is present
 * wins — so more specific manifests (lockfiles, `deno.json`) come before
 * generic ones (`package.json`).
 *
 * Deno wins over Node when both appear: deco-sites and friends ship
 * `deno.json` plus a stray `package.json` for editor tooling.
 */
const DETECTION_TABLE: readonly {
  readonly manifest: string;
  readonly runtime: Runtime;
}[] = [
  { manifest: "deno.json", runtime: DENO },
  { manifest: "deno.jsonc", runtime: DENO },
  { manifest: "bun.lockb", runtime: BUN },
  { manifest: "bun.lock", runtime: BUN },
  { manifest: "pnpm-lock.yaml", runtime: PNPM_RUNTIME },
  { manifest: "yarn.lock", runtime: YARN_RUNTIME },
  { manifest: "package-lock.json", runtime: NPM_CI_RUNTIME },
  { manifest: "package.json", runtime: NPM_INSTALL_RUNTIME },
];

export async function detectRuntime(builderId: string): Promise<Runtime> {
  const files = await listWorkdir(builderId);
  for (const { manifest, runtime } of DETECTION_TABLE) {
    if (files.has(manifest)) return runtime;
  }
  return NONE;
}

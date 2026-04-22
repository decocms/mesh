/**
 * Prep Image Baker — orienting a cold reader
 *
 * What this does
 *   Builds a Docker image that carries a cloned repo + installed deps for a
 *   (user, repo) pair. Thread containers start *from* this image and skip
 *   the clone + install cold-start that would otherwise hit every boot.
 *
 * Relationship to server/runner/
 *   prep never starts a thread container; runner never builds an image.
 *   Runner launches live thread containers from the image prep committed,
 *   and shares the docker-CLI primitives (startContainer, execInContainer,
 *   DEFAULT_WORKDIR) via `server/docker-helpers.ts`.
 *
 * tolerateExit everywhere
 *   Install + warmup steps pass `tolerateExit: true`. A partial cache still
 *   accelerates every future thread, so a flaky postinstall that returns
 *   non-zero is worth logging and moving on — aborting the commit forces
 *   every thread to redo the work from scratch.
 *
 * Adding a runtime
 *   = new file in `./runtimes/` exporting a `Runtime` + one row in the
 *   detection table in `./runtimes/index.ts`. Deno is the only runtime with
 *   real warmup today; bun/node/none are install-only and live inline.
 *
 * Flow (what bakePrepImage does)
 *   1. `docker run` a builder container with `sleep infinity` so we can
 *      exec into it without the daemon.
 *   2. Clone the repo into `/app`.
 *   3. Detect runtime, run its install + optional warmup.
 *   4. Probe the lockfile hash + git HEAD (for stale-cache detection).
 *   5. `docker commit` with the daemon entrypoint restored → tagged image.
 *   6. `docker rm -f` the builder, even on failure.
 */

import { DEFAULT_IMAGE, gitIdentityScript } from "../../shared";
import {
  commitBuilder,
  DEFAULT_WORKDIR,
  execIn,
  runDocker,
  shellQuote,
  startBuilder,
  type BakeLogger,
} from "./docker";
import { probeHeadSha, probeLockfileHash } from "./probes";
import { detectRuntime } from "./runtimes";
import type { RuntimeContext } from "./runtimes";

const TIMEOUTS = {
  /** Medium-to-large deco-sites routinely push past the 60s baseline. */
  clone: 10 * 60_000,
  /** Full `pnpm install` on a cold cache + native-binary builds can take a while. */
  install: 20 * 60_000,
} as const;

export interface BakeInput {
  prepKey: string;
  cloneUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  /**
   * Overrides the base image. Defaults to the plain `mesh-sandbox:local`.
   */
  baseImage?: string;
  /**
   * Install command override. When omitted we detect the runtime from the
   * cloned tree and use the runtime's `defaultInstallCommand`.
   */
  installCommand?: string | null;
}

export interface BakeResult {
  imageTag: string;
  lockfileHash: string | null;
  headSha: string | null;
  installCommand: string;
}

export interface BakeOptions {
  /**
   * Callback for streaming human-readable progress lines. Useful when the
   * caller wants to surface bake output in logs or UI. Defaults to no-op.
   */
  log?: BakeLogger;
}

export type { BakeLogger } from "./docker";

export async function bakePrepImage(
  input: BakeInput,
  opts: BakeOptions = {},
): Promise<BakeResult> {
  const log = opts.log ?? (() => {});
  const baseImage = input.baseImage ?? DEFAULT_IMAGE;
  const imageTag = prepImageTag(input.prepKey);

  log(`[prep:${input.prepKey}] starting bake from base ${baseImage}`);
  const builderId = await startBuilder(baseImage);
  log(`[prep:${input.prepKey}] builder container: ${builderId}`);

  try {
    const exec: RuntimeContext["exec"] = (script, stepOpts) =>
      execIn(builderId, script, {
        ...stepOpts,
        log,
        prepKey: input.prepKey,
      });

    await exec(cloneScript(input), {
      label: "clone",
      timeoutMs: TIMEOUTS.clone,
    });

    const runtime = await detectRuntime(builderId);
    const installCommand =
      input.installCommand ?? runtime.defaultInstallCommand;
    log(
      `[prep:${input.prepKey}] runtime=${runtime.name}; install=${installCommand}`,
    );
    await exec(installScript(installCommand), {
      label: "install",
      timeoutMs: TIMEOUTS.install,
      // Partial installs (one flaky postinstall, one deprecation warning
      // that the package manager escalates to exit 1) are strictly better
      // than an empty image. Whatever did land in the cache still
      // accelerates future threads.
      tolerateExit: true,
    });

    if (runtime.warmup) {
      await runtime.warmup({
        builderId,
        prepKey: input.prepKey,
        log,
        exec,
      });
    }

    const [lockfileHash, headSha] = await Promise.all([
      probeLockfileHash(builderId),
      probeHeadSha(builderId),
    ]);

    log(
      `[prep:${input.prepKey}] committing image (lockfile=${lockfileHash ?? "none"}, head=${headSha ?? "none"})`,
    );
    await commitBuilder(builderId, imageTag);

    return { imageTag, lockfileHash, headSha, installCommand };
  } finally {
    await runDocker(["rm", "-f", builderId]).catch(() => {});
  }
}

// ─── scripts that run inside the builder ────────────────────────────────────

function cloneScript(input: BakeInput): string {
  const q = shellQuote;
  const workdir = q(DEFAULT_WORKDIR);
  // Clone into /tmp first when /app is non-empty (base image seeded it),
  // then move the .git directory and tracked files over. In practice /app
  // is empty here, so the direct clone path wins.
  return [
    `mkdir -p ${workdir}`,
    gitIdentityScript(input.gitUserName, input.gitUserEmail),
    `if [ -z "$(ls -A ${workdir} 2>/dev/null)" ]; then git clone ${q(input.cloneUrl)} ${workdir}; else echo "workdir not empty, cloning into tmp" && rm -rf /tmp/prep-clone && git clone ${q(input.cloneUrl)} /tmp/prep-clone && cp -a /tmp/prep-clone/. ${workdir}/ && rm -rf /tmp/prep-clone; fi`,
  ].join(" && ");
}

function installScript(installCommand: string): string {
  return `cd ${shellQuote(DEFAULT_WORKDIR)} && ${installCommand}`;
}

// ─── Public helpers ─────────────────────────────────────────────────────────

export function prepImageTag(prepKey: string): string {
  return `mesh-sandbox-prep:${prepKey}`;
}

export async function prepImageExists(tag: string): Promise<boolean> {
  const result = await runDocker(["image", "inspect", tag]);
  return result.code === 0;
}

export async function deletePrepImage(tag: string): Promise<void> {
  await runDocker(["rmi", tag]);
}

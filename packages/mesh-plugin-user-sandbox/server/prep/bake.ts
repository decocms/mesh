/**
 * Prep Image Baker
 *
 * Produces a Docker image that carries a cloned repo + installed dependencies
 * for a (user, repo) pair, so new thread containers can skip clone + install
 * on startup.
 *
 * Contract:
 *   bakePrepImage(input) → tag'd image name on success; throws on failure.
 *
 * Flow:
 *   1. `docker run` a builder container from the sandbox base image with
 *      the default daemon replaced by `sleep infinity` so we can exec into
 *      an otherwise idle container.
 *   2. Clone the repo into `/app`.
 *   3. Detect the runtime (deno/bun/node/none) from the manifest files in
 *      the clone and delegate install + warmup to the runtime strategy.
 *      Runtime-specific behaviour lives in `./runtimes/<name>.ts` — this
 *      file never branches on runtime name.
 *   4. Probe the lockfile hash + git HEAD so the bake worker can detect
 *      stale caches.
 *   5. `docker commit` the builder to `mesh-sandbox-prep:<prepKey>`, restoring
 *      the daemon entrypoint so containers spawned from this image behave
 *      like a fresh runner container.
 *   6. `docker rm -f` the builder.
 *
 * The function is self-contained: no mesh/db imports, no ambient state. The
 * caller (prep worker) owns persistence and the row lifecycle.
 */

import { DEFAULT_IMAGE } from "../../shared";
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
import type { RuntimeContext } from "./runtimes/types";

const CLONE_TIMEOUT_MS = 10 * 60_000;
const INSTALL_TIMEOUT_MS = 20 * 60_000;

export interface BakeInput {
  prepKey: string;
  cloneUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  /** Overrides the base image. Defaults to the plugin's shared image. */
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
      timeoutMs: CLONE_TIMEOUT_MS,
    });

    const runtime = await detectRuntime(builderId);
    const installCommand =
      input.installCommand ?? runtime.defaultInstallCommand;
    log(
      `[prep:${input.prepKey}] runtime=${runtime.name}; install=${installCommand}`,
    );
    await exec(installScript(installCommand), {
      label: "install",
      timeoutMs: INSTALL_TIMEOUT_MS,
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
  return [
    `mkdir -p ${workdir}`,
    `git config --global user.name ${q(input.gitUserName)}`,
    `git config --global user.email ${q(input.gitUserEmail)}`,
    // Clone into /tmp first so we can detect an existing /app that happens
    // to be non-empty (e.g. base image seeded it), then move the .git
    // directory and tracked files over. In practice /app is empty here, so
    // the direct clone path wins.
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

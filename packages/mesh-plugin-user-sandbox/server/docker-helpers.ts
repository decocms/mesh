/**
 * Shared docker-CLI primitives reused by prep (image baker) and runner
 * (live thread containers). Both sides shell out to `docker run -d` and
 * `docker exec … bash -lc …`; the only thing that differs between them is
 * the flag/arg payload. These helpers unify the spawn-and-parse plumbing
 * so the callers can focus on their flag assembly.
 */

import { dockerExec, type DockerResult } from "./docker-cli";

/**
 * Canonical workdir inside every sandbox image. Overridable per-ensure via
 * `EnsureOptions.workdir`, but by default the baker writes here and thread
 * containers start here too.
 */
export const DEFAULT_WORKDIR = "/app";

export type DockerExecFn = (
  args: string[],
  timeoutMs?: number,
) => Promise<DockerResult>;

export interface StartContainerOptions {
  /**
   * Flags appended to `docker run -d` (before the image). Caller owns labels,
   * mounts, port mappings, env, entrypoint overrides — the helper doesn't
   * unify those because they differ meaningfully between prep and runner.
   */
  args: readonly string[];
  /** Command + args to run as the container's main process (after the image). */
  command?: readonly string[];
  timeoutMs?: number;
  /** Short human label (e.g. "builder", "sandbox") used in error messages. */
  label: string;
  /**
   * Optional override of the docker-cli spawn. Defaults to the shared
   * `dockerExec`. Exposed so `DockerSandboxRunner`'s test-mode `exec`
   * injection continues to work through this helper.
   */
  exec?: DockerExecFn;
}

/**
 * `docker run -d <args> <image> [command...]` — detached launch, parse the
 * container id off stdout, throw with a readable message on spawn failure or
 * missing id.
 */
export async function startContainer(
  image: string,
  opts: StartContainerOptions,
): Promise<{ id: string }> {
  const run = opts.exec ?? dockerExec;
  const result = await run(
    ["run", "-d", ...opts.args, image, ...(opts.command ?? [])],
    opts.timeoutMs,
  );
  if (result.code !== 0) {
    const tail = result.stderr.trim() || result.stdout.trim() || "no output";
    throw new Error(
      `docker run ${opts.label} failed (exit ${result.code}): ${tail}`,
    );
  }
  const id = result.stdout.trim().split("\n").pop()?.trim();
  if (!id) {
    throw new Error(`docker run ${opts.label} returned no container id`);
  }
  return { id };
}

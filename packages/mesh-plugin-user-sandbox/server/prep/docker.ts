/**
 * Docker subprocess helpers for the prep baker.
 *
 * The bake pipeline is "run docker a bunch of times, checking exit codes".
 * These helpers isolate that plumbing from the orchestrator in `bake.ts`
 * so the orchestrator reads as a straight line: clone → install → warm →
 * commit.
 */

import { DAEMON_PORT } from "../../shared";
import { dockerExec, type DockerResult } from "../docker-cli";

export { shellQuote } from "../../shared";
export type { DockerResult } from "../docker-cli";

export const DEFAULT_WORKDIR = "/app";
const BUILDER_LABEL = "mesh-sandbox-prep-builder";
const DEFAULT_PREP_TIMEOUT_MS = 60_000;

export type BakeLogger = (line: string) => void;

/** Run `docker <args>` with prep's default 60s timeout. */
export function runDocker(
  args: string[],
  timeoutMs = DEFAULT_PREP_TIMEOUT_MS,
): Promise<DockerResult> {
  return dockerExec(args, timeoutMs);
}

export async function startBuilder(baseImage: string): Promise<string> {
  // `sleep infinity` keeps the builder alive without the daemon — we commit
  // it back to daemon CMD later. Not passing -p so we don't reserve a host
  // port we'll never talk to.
  const result = await runDocker([
    "run",
    "-d",
    "--label",
    `${BUILDER_LABEL}=1`,
    "--entrypoint",
    "/bin/sleep",
    baseImage,
    "infinity",
  ]);
  if (result.code !== 0) {
    throw new Error(
      `docker run builder failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  const handle = result.stdout.trim().split("\n").pop()?.trim();
  if (!handle) {
    throw new Error("docker run builder returned no container id");
  }
  return handle;
}

export async function commitBuilder(
  handle: string,
  tag: string,
): Promise<void> {
  // The builder was launched with `--entrypoint /bin/sleep`, so the source
  // container carries that entrypoint and commit inherits it. `docker commit`
  // has no supported syntax for *clearing* an entrypoint (`--change
  // 'ENTRYPOINT []'` is silently a no-op), so we overwrite it with the daemon
  // command directly and leave CMD empty. Without this, thread containers
  // spawned from the prep image run `/bin/sleep node /opt/...daemon.mjs`,
  // which exits 1 immediately and produces a port-readback timeout upstream.
  const result = await runDocker([
    "commit",
    "--change",
    'ENTRYPOINT ["node","/opt/sandbox-daemon/daemon.mjs"]',
    "--change",
    "CMD []",
    "--change",
    `EXPOSE ${DAEMON_PORT}`,
    handle,
    tag,
  ]);
  if (result.code !== 0) {
    throw new Error(
      `docker commit failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
}

export interface ExecStepOptions {
  timeoutMs: number;
  label: string;
  log: BakeLogger;
  prepKey: string;
  /**
   * When true, a non-zero exit is logged as a warning and the step is still
   * considered successful. Used for install + warmup steps — partial caches
   * are strictly better than none.
   */
  tolerateExit?: boolean;
}

/**
 * Run `script` as `bash -lc` inside the builder container. `-lc` so that
 * shims installed by the base image (deno, bun, nvm, etc.) resolve via
 * the login shell's PATH.
 */
export async function execIn(
  handle: string,
  script: string,
  opts: ExecStepOptions,
): Promise<void> {
  const result = await runDocker(
    ["exec", handle, "bash", "-lc", script],
    opts.timeoutMs,
  );
  if (result.stdout.trim())
    opts.log(`[prep:${opts.prepKey}] ${opts.label}: ${result.stdout.trim()}`);
  if (result.code !== 0) {
    const tail = result.stderr.trim() || result.stdout.trim() || "no output";
    if (opts.tolerateExit) {
      opts.log(
        `[prep:${opts.prepKey}] ${opts.label} exited ${result.code} (continuing): ${tail.slice(-400)}`,
      );
      return;
    }
    throw new Error(`prep ${opts.label} failed (exit ${result.code}): ${tail}`);
  }
}

/**
 * Docker CLI primitives used by the sandbox runner. One module for the
 * spawn-and-parse plumbing (`dockerExec`) and the higher-level `docker run -d`
 * helper (`startContainer`) so the runner can focus on flag assembly.
 */

import { spawn } from "node:child_process";

export interface DockerResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Canonical workdir inside every sandbox image. Overridable per-ensure via
 * `EnsureOptions.workdir`, but by default thread containers start here.
 */
export const DEFAULT_WORKDIR = "/app";

export type DockerExecFn = (
  args: string[],
  timeoutMs?: number,
) => Promise<DockerResult>;

/**
 * Run `docker <args>`. When `timeoutMs` is set, a SIGKILL is delivered on
 * expiry and the stderr is augmented with a `[docker <subcommand>] timed out
 * after <ms>ms` line so upstream errors are self-diagnosing.
 *
 * ENOENT at spawn time is rewritten into a human-readable "install Docker"
 * error — by far the most common failure mode on fresh dev machines.
 */
export function dockerExec(
  args: string[],
  timeoutMs?: number,
): Promise<DockerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer =
      timeoutMs != null
        ? setTimeout(() => {
            stderr += `\n[docker ${args[0]}] timed out after ${timeoutMs}ms`;
            child.kill("SIGKILL");
          }, timeoutMs)
        : null;
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "docker CLI not found on PATH. Install Docker Desktop (macOS) or Docker Engine (Linux).",
          ),
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

export interface StartContainerOptions {
  /**
   * Flags appended to `docker run -d` (before the image). Caller owns labels,
   * mounts, port mappings, env, entrypoint overrides.
   */
  args: readonly string[];
  /** Command + args to run as the container's main process (after the image). */
  command?: readonly string[];
  timeoutMs?: number;
  /** Short human label (e.g. "sandbox") used in error messages. */
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

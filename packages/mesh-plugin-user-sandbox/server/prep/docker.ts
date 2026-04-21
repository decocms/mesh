/**
 * Docker subprocess helpers for the prep baker.
 *
 * The bake pipeline is "run docker a bunch of times, checking exit codes".
 * These helpers isolate that plumbing from the orchestrator in `bake.ts`
 * so the orchestrator reads as a straight line: clone → install → warm →
 * commit.
 */

import { spawn } from "node:child_process";
import { DAEMON_PORT } from "../../shared";

export const DEFAULT_WORKDIR = "/app";
const BUILDER_LABEL = "mesh-sandbox-prep-builder";

export type BakeLogger = (line: string) => void;

export interface DockerResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function runDocker(
  args: string[],
  timeoutMs = 60_000,
): Promise<DockerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stderr += `\n[docker ${args[0]}] timed out after ${timeoutMs}ms`;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
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
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
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

/** Shell-quote a value for safe inclusion in a `bash -lc` script. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

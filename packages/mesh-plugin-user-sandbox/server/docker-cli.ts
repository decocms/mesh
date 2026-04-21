/**
 * Canonical `docker` CLI subprocess wrapper. Shared by prep (bake pipeline)
 * and runner (sandbox provisioning) — both shell out to the docker CLI, so
 * a single spawn helper keeps stdout/stderr handling and the "docker not
 * installed" error message in one place.
 */

import { spawn } from "node:child_process";

export interface DockerResult {
  stdout: string;
  stderr: string;
  code: number;
}

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

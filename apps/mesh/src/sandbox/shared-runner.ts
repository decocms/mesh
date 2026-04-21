/**
 * Shared sandbox runner singleton.
 *
 * Both the `bash` tool (used inside streaming conversations) and the preview
 * proxy route (`/api/sandbox/*`) need the same runner instance so their view
 * of in-memory state (port mappings, tokens) stays consistent. Wiring them to
 * a single singleton avoids a second runner racing docker against the first.
 *
 * The state store is still the source of truth across process restarts — the
 * singleton is purely an optimisation for the common in-process case.
 */

import { spawn } from "node:child_process";
import type { MeshContext } from "@/core/mesh-context";
import {
  DockerSandboxRunner,
  type SandboxRunner,
  createRunner,
} from "mesh-plugin-user-sandbox/runner";
import { CLAUDE_IMAGE } from "mesh-plugin-user-sandbox/shared";
import { KyselySandboxRunnerStateStore } from "@/storage/sandbox-runner-state";

let sharedRunner: SandboxRunner | null = null;

export function getSharedRunner(ctx: MeshContext): SandboxRunner {
  if (!sharedRunner) {
    sharedRunner = createRunner({
      stateStore: new KyselySandboxRunnerStateStore(ctx.db),
    });
  }
  return sharedRunner;
}

/**
 * Return the singleton iff it's already been created — without lazily
 * initialising one. Used by the shutdown path to sweep orphaned sandboxes
 * without forcing a MeshContext in a teardown hook that may not have one.
 * If no request ever touched the sandbox, there's nothing to sweep.
 */
export function getSharedRunnerIfInit(): SandboxRunner | null {
  return sharedRunner;
}

/**
 * Sweep every container labelled `mesh-sandbox=1` on the local docker daemon.
 * Called at boot so each mesh process starts with a clean slate — prior runs
 * that crashed, were SIGKILL'd, or whose shutdown handler raced with the
 * parent process leave containers behind, and shutdown-time cleanup alone is
 * insufficient. Deliberately does NOT use the state store: at boot we may
 * not even have a DB connection yet, and the docker CLI is the source of
 * truth. No-op when docker isn't the runner or isn't installed.
 */
export async function sweepSandboxesOnBoot(): Promise<void> {
  if (process.env.MESH_SANDBOX_RUNNER !== "docker") return;
  try {
    const runner = new DockerSandboxRunner();
    const n = await runner.sweepOrphans();
    if (n > 0) {
      console.log(`[sandbox] Boot sweep: stopped ${n} stale container(s).`);
    }
  } catch (err) {
    console.warn(
      "[sandbox] Boot sweep failed (continuing without it):",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Verify the `mesh-sandbox:claude` image actually contains the claude
 * binary. A common failure mode is `docker tag mesh-sandbox:local
 * mesh-sandbox:claude` instead of running `Dockerfile.claude` — the tag
 * exists, the prep bake stamps `mesh.claude=1`, and every thread silently
 * eats ~18s of lazy install on first turn. This boot probe surfaces the
 * misconfig once at startup so the operator fixes it before threads start
 * paying for it.
 *
 * Skipped when the docker runner isn't selected, when claude-in-sandbox
 * isn't opted in, or when docker isn't available — none of those are
 * reachable problems for this check.
 */
export async function probeClaudeImageOnBoot(): Promise<void> {
  if (process.env.MESH_SANDBOX_RUNNER !== "docker") return;
  if (process.env.MESH_CLAUDE_CODE_IN_SANDBOX !== "1") return;
  const image = process.env.MESH_SANDBOX_CLAUDE_IMAGE ?? CLAUDE_IMAGE;
  try {
    const result = await runDockerProbe([
      "run",
      "--rm",
      "--entrypoint",
      "/bin/sh",
      image,
      "-c",
      "command -v claude && claude --version",
    ]);
    if (result.code !== 0) {
      console.warn(
        `[sandbox] ${image} is missing the claude binary — every thread ` +
          `will pay ~18s of lazy install on first turn, and prep bakes will ` +
          `fail at the verify-claude step. Rebuild with: ` +
          `docker build -t ${image} -f packages/mesh-plugin-user-sandbox/image/Dockerfile.claude packages/mesh-plugin-user-sandbox/image && ` +
          `docker rmi $(docker images -q "mesh-sandbox-prep:*"). ` +
          `Probe stderr: ${result.stderr.trim() || "(empty)"}`,
      );
    }
  } catch (err) {
    // Docker missing / image absent / daemon down — the runner itself
    // will surface a clearer error on first use. Silent here so this
    // probe never blocks startup.
    console.warn(
      `[sandbox] Claude image probe skipped (${image} not inspectable):`,
      err instanceof Error ? err.message : err,
    );
  }
}

interface DockerProbeResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runDockerProbe(args: string[]): Promise<DockerProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

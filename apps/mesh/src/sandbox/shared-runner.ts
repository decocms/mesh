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

import type { MeshContext } from "@/core/mesh-context";
import {
  DockerSandboxRunner,
  type SandboxRunner,
  createRunner,
} from "mesh-plugin-user-sandbox/runner";
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

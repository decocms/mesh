/**
 * Stage 1 exit-criterion smoke test (see PLAN-K8S-MVP.md § 1.5/1.6).
 *
 * Runs KubernetesSandboxRunner end-to-end against a live kind cluster:
 *   ensure → exec → preview fetch → delete → recreate (cold) → ensure (warm)
 *   → alive → delete.
 *
 * Not part of `bun test` — the runner needs a real cluster to talk to and
 * tears up/down ~60s of pod lifecycle. Run explicitly:
 *
 *     bun run deploy/k8s-sandbox/local/smoke.ts
 *
 * Preconditions (see README.md):
 *   - `deploy/k8s-sandbox/local/up.sh` succeeded
 *   - `kubectl --context kind-mesh-sandbox-dev get pods -n agent-sandbox-system`
 *     shows the controller Running
 *   - `mesh-sandbox:local` is loaded into the kind cluster
 *
 * Exit codes:
 *   0 — all steps passed
 *   1 — any step failed (error surfaced to stderr)
 */

// Imported via relative paths, not the package export name: this script is
// not inside any package, so bun would resolve module names from repo-root
// node_modules (which doesn't carry @decocms/sandbox). Relative imports
// resolve @kubernetes/client-node from the package's own node_modules
// naturally.
import {
  KubeConfig,
  KubernetesSandboxRunner,
} from "../../../packages/sandbox/server/runner/k8s";
import type { SandboxId } from "../../../packages/sandbox/server/runner/types";

const KIND_CONTEXT = "kind-mesh-sandbox-dev";
const NAMESPACE = "agent-sandbox-system";

// Unique per run so repeated invocations don't collide on stale state.
const RUN_ID = process.env.SMOKE_RUN_ID ?? Date.now().toString(36);
const ID: SandboxId = {
  userId: `smoke-user-${RUN_ID}`,
  projectRef: `agent:smoke-org:smoke-vmcp:smoke-${RUN_ID}`,
};

function log(step: string, detail = ""): void {
  const ts = new Date().toISOString().slice(11, 23);
  process.stdout.write(
    `[smoke ${ts}] ${step}${detail ? ` — ${detail}` : ""}\n`,
  );
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function buildKubeConfig(): KubeConfig {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  // Force kind context: ambient KUBECONFIG on dev laptops often points at
  // prod/staging, and a misfire here would create real pods.
  kc.setCurrentContext(KIND_CONTEXT);
  return kc;
}

async function run(): Promise<void> {
  const kubeConfig = buildKubeConfig();

  // Two runner instances with disjoint in-process maps — simulates a mesh
  // restart between steps (1st provision → 2nd ensure after delete).
  // No stateStore: the K8s API is the source of truth for the smoke test.
  const runnerA = new KubernetesSandboxRunner({
    kubeConfig,
    namespace: NAMESPACE,
  });
  const runnerB = new KubernetesSandboxRunner({
    kubeConfig,
    namespace: NAMESPACE,
  });

  let handle = "";
  let firstPreviewUrl: string | null = null;

  try {
    // 1. ensure (cold). Claim, pod, daemon, port-forward.
    log("1/8 ensure (cold)");
    const t0 = Date.now();
    const sandboxA = await runnerA.ensure(ID, {});
    handle = sandboxA.handle;
    log("    created", `handle=${handle} (${Date.now() - t0}ms)`);
    if (!handle.startsWith("mesh-sb-")) {
      throw new Error(`handle missing expected prefix: ${handle}`);
    }

    // 2. exec. Bash round-trip through the daemon.
    log("2/8 exec");
    const echo = await runnerA.exec(handle, {
      command: "echo hello-from-pod && id -u && pwd",
    });
    if (echo.exitCode !== 0) {
      throw new Error(`exec exit=${echo.exitCode} stderr=${echo.stderr}`);
    }
    const lines = echo.stdout.trim().split("\n");
    assertEq(lines[0], "hello-from-pod", "exec stdout line 1");
    assertEq(lines[1], "1000", "pod should run as uid 1000");
    assertEq(lines[2], "/app", "workdir should be /app");

    // 3. preview URL + HTTP fetch.
    log("3/8 preview");
    const preview = await runnerA.getPreviewUrl(handle);
    if (!preview) throw new Error("getPreviewUrl returned null");
    firstPreviewUrl = preview;
    if (!preview.startsWith("http://127.0.0.1:")) {
      throw new Error(`unexpected preview URL shape: ${preview}`);
    }
    // Dev server won't bind in a bare-pod smoke (no repo / no dev script).
    // We only check that the port-forward is live — any HTTP response (incl.
    // 502/404) proves the listener is accepting connections.
    const previewResp = await fetch(preview, {
      signal: AbortSignal.timeout(3_000),
    }).catch((err: unknown) => err as Error);
    if (previewResp instanceof Error) {
      // Connection refused from inside the pod is fine — dev server isn't
      // running. What we must NOT see is ECONNREFUSED on the 127.0.0.1
      // listener itself (that would mean the forwarder never bound).
      const msg = previewResp.message;
      if (/ECONNREFUSED.*127\.0\.0\.1/.test(msg)) {
        throw new Error(`preview port-forward not listening: ${msg}`);
      }
      log("    forwarder live", "dev server not bound (expected)");
    } else {
      log("    forwarder live", `status=${previewResp.status}`);
    }

    // 4. alive=true.
    log("4/8 alive");
    const aliveBefore = await runnerA.alive(handle);
    if (!aliveBefore) throw new Error("alive returned false for Ready claim");

    // 5. delete.
    log("5/8 delete");
    await runnerA.delete(handle);
    // Operator takes a beat to reconcile the claim gone; alive() depends on
    // the claim existing, so this may flip false on the next tick. Poll
    // briefly rather than sleep a fixed amount.
    const deletedBy = Date.now() + 30_000;
    while (Date.now() < deletedBy) {
      if (!(await runnerA.alive(handle))) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (await runnerA.alive(handle)) {
      throw new Error("claim still reports alive 30s after delete");
    }

    // 6. recreate (cold) through runnerB. Fresh process view of the same id —
    //    proves a restarted mesh can bring the same projectRef back up without
    //    any in-process state.
    log("6/8 recreate (cold)");
    const t1 = Date.now();
    const sandboxB = await runnerB.ensure(ID, {});
    log("    recreated", `handle=${sandboxB.handle} (${Date.now() - t1}ms)`);
    assertEq(sandboxB.handle, handle, "recreate should yield same handle");

    // 7. ensure (warm) — second call on runnerB must short-circuit through
    //    the in-process map, no new provision, same handle.
    log("7/8 ensure (warm)");
    const t2 = Date.now();
    const sandboxWarm = await runnerB.ensure(ID, {});
    const warmElapsed = Date.now() - t2;
    log("    warm", `${warmElapsed}ms`);
    assertEq(sandboxWarm.handle, handle, "warm ensure should match handle");
    if (warmElapsed > 5_000) {
      throw new Error(
        `warm ensure took ${warmElapsed}ms — expected in-process cache to make this near-instant`,
      );
    }

    // Alive should still be true after the warm round-trip.
    if (!(await runnerB.alive(handle))) {
      throw new Error("alive=false after warm ensure");
    }

    // 8. final delete. Leaves the kind cluster clean for the next run.
    log("8/8 delete (final)");
    await runnerB.delete(handle);

    log("OK", `handle=${handle} firstPreview=${firstPreviewUrl ?? "null"}`);
  } catch (err) {
    // Best-effort cleanup so a failing run doesn't wedge the cluster.
    if (handle) {
      await runnerA.delete(handle).catch(() => {});
      await runnerB.delete(handle).catch(() => {});
    }
    throw err;
  }
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(
      `[smoke] FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  },
);

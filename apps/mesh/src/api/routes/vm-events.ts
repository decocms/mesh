/**
 * Unified VM events SSE.
 *
 * Single browser-facing stream for everything happening to a sandbox keyed
 * on (virtualMcpId, branch, callerUserId):
 *
 *   1. Pre-Ready lifecycle phases (`event: phase`) — surfaces the gap between
 *      VM_START posting a SandboxClaim and the daemon coming online.
 *      Agent-sandbox runner emits real K8s phases; other runners emit a
 *      single synthetic `ready`.
 *   2. Daemon events (`event: log|status|scripts|processes|reload|branch-status`)
 *      — proxied from the in-pod daemon's `/_decopilot_vm/events` SSE once
 *      lifecycle reaches `ready`. Wire format is preserved verbatim by raw
 *      byte-piping the upstream body, so daemon and client speak the same
 *      protocol they always have.
 *   3. `event: gone` — synthetic. Mesh's upstream daemon fetch returned 404
 *      (sandbox handle missing → operator evicted on idle TTL, etc). Client
 *      maps to `notFound` and triggers self-heal via VM_START.
 *   4. `event: keepalive` — heartbeat. 15s matches the existing daemon SSE.
 *
 * Auth model:
 *   - Caller must be authenticated.
 *   - Caller's organization must own the requested virtualMcp.
 *   - Claim name is derived deterministically from
 *     (orgId, virtualMcpId, branch, callerUserId), so a caller only sees
 *     events for *their own* sandbox; another user in the same org would
 *     compute a different handle.
 *
 * Why one stream instead of two: prior design had the browser open
 * `/api/vm-lifecycle` (mesh) plus a direct EventSource to the daemon's public
 * `/_decopilot_vm/events`. The daemon endpoint is unauthenticated (Vercel-style
 * "URL is the secret") and putting two long-lived SSEs in every tab burned
 * the EventSource budget. Routing through mesh authenticates the surface and
 * collapses to one connection per session.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  composeSandboxRef,
  tryResolveRunnerKindFromEnv,
} from "@decocms/sandbox/runner";
import { composeClaimName } from "@decocms/sandbox/runner/agent-sandbox";
import type { ClaimPhase } from "@decocms/sandbox/runner/agent-sandbox";
import {
  asLifecycleWatchable,
  getOrInitSharedRunner,
} from "../../sandbox/lifecycle";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import type { Env } from "../hono-env";

/**
 * Hard cap on how long we'll keep the SSE open if a claim never materializes
 * (e.g. caller raced VM_START but VM_START failed before
 * `createSandboxClaim`). Prevents indefinite "claiming" streams.
 */
const NO_CLAIM_MAX_MS = 5 * 60 * 1000;

const HEARTBEAT_MS = 15_000;

const app = new Hono<Env>();

app.get("/", async (c) => {
  const ctx = c.var.meshContext;
  try {
    requireAuth(ctx);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const userId = getUserId(ctx);
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let organization: ReturnType<typeof requireOrganization>;
  try {
    organization = requireOrganization(ctx);
  } catch {
    return c.json({ error: "Organization scope required" }, 403);
  }

  const virtualMcpId = c.req.query("virtualMcpId");
  const branch = c.req.query("branch");
  if (!virtualMcpId || !branch) {
    return c.json({ error: "virtualMcpId and branch are required" }, 400);
  }

  // Verify caller's org actually owns this virtualMcp. Without this check,
  // an authenticated user could probe arbitrary virtualMcpIds — the claim
  // hash includes their userId so they couldn't *observe* anyone else's
  // events, but the 404 vs not-yet-created surface would still leak
  // existence/identity information.
  const virtualMcp = await ctx.storage.virtualMcps.findById(virtualMcpId);
  if (!virtualMcp || virtualMcp.organization_id !== organization.id) {
    return c.json({ error: "Virtual MCP not found" }, 404);
  }

  const projectRef = composeSandboxRef({
    orgId: organization.id,
    virtualMcpId,
    branch,
  });
  const claimName = composeClaimName({ userId, projectRef }, branch);

  const runnerKind = tryResolveRunnerKindFromEnv();
  const runner = await getOrInitSharedRunner();

  // No runner configured at all → can't proxy daemon SSE. Surface a failed
  // phase rather than a silent close so the UI shows a meaningful error.
  if (!runner) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "phase",
        data: JSON.stringify({
          kind: "failed",
          reason: "unknown",
          message: "No sandbox runner configured on this mesh.",
        } satisfies ClaimPhase),
      });
    });
  }

  return streamSSE(c, async (stream) => {
    const abortCtl = new AbortController();
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: "keepalive", data: "" }).catch(() => {
        clearInterval(heartbeat);
      });
    }, HEARTBEAT_MS);
    stream.onAbort(() => {
      abortCtl.abort();
      clearInterval(heartbeat);
    });

    try {
      // ---- Phase 1: lifecycle (pre-Ready) ---------------------------------
      const lifecycleOk = await emitLifecycle({
        stream,
        runnerKind,
        claimName,
        runner,
        signal: abortCtl.signal,
      });
      if (!lifecycleOk || abortCtl.signal.aborted) return;

      // ---- Phase 2: daemon SSE proxy --------------------------------------
      await proxyDaemonEvents({
        stream,
        runner,
        claimName,
        signal: abortCtl.signal,
      });
    } finally {
      clearInterval(heartbeat);
    }
  });
});

/**
 * Drives the lifecycle generator (or its no-op equivalent for non-agent-sandbox
 * runners) until a terminal phase. Returns `true` if the terminal phase was
 * `ready` (caller proceeds to daemon proxy), `false` otherwise (failed,
 * aborted, or watchdog-tripped).
 */
async function emitLifecycle(args: {
  stream: import("hono/streaming").SSEStreamingApi;
  runnerKind: ReturnType<typeof tryResolveRunnerKindFromEnv>;
  claimName: string;
  runner: NonNullable<Awaited<ReturnType<typeof getOrInitSharedRunner>>>;
  signal: AbortSignal;
}): Promise<boolean> {
  const { stream, runnerKind, claimName, runner, signal } = args;

  // Non-agent-sandbox runners (Docker/Freestyle) have no equivalent
  // pre-Ready window worth surfacing — Docker is local-fast, Freestyle's
  // setup is end-to-end. Emit a single `ready` and proceed straight to
  // daemon proxy.
  if (runnerKind !== "agent-sandbox") {
    await stream.writeSSE({
      event: "phase",
      data: JSON.stringify({ kind: "ready" } satisfies ClaimPhase),
    });
    return true;
  }

  const watchable = asLifecycleWatchable(runner);
  if (!watchable) {
    // Runner kind says agent-sandbox but the instance doesn't expose the
    // watch capability (e.g. older module loaded). Treat as no-op.
    await stream.writeSSE({
      event: "phase",
      data: JSON.stringify({ kind: "ready" } satisfies ClaimPhase),
    });
    return true;
  }

  const startedAt = Date.now();
  let claimSeen = false;

  // Watchdog: if we've been streaming for NO_CLAIM_MAX_MS and the watcher
  // has only ever surfaced `claiming` (i.e. the SandboxClaim never
  // materialized), close with a `claim-never-created` failure. Prevents
  // zombie streams when VM_START failed before posting the claim.
  const watchdogAbort = new AbortController();
  const composedSignal = composeSignals(signal, watchdogAbort.signal);
  const watchdog = setInterval(() => {
    if (claimSeen) return;
    if (Date.now() - startedAt < NO_CLAIM_MAX_MS) return;
    stream
      .writeSSE({
        event: "phase",
        data: JSON.stringify({
          kind: "failed",
          reason: "claim-never-created",
          message:
            "Sandbox claim was never created. The VM_START call may have failed earlier — check the start error.",
        } satisfies ClaimPhase),
      })
      .catch(() => {});
    watchdogAbort.abort();
  }, 30_000);

  try {
    for await (const phaseUntyped of watchable.watchClaimLifecycle(
      claimName,
      composedSignal,
    )) {
      const phase = phaseUntyped as ClaimPhase;
      if (phase.kind !== "claiming") claimSeen = true;
      await stream.writeSSE({
        event: "phase",
        data: JSON.stringify(phase),
      });
      if (phase.kind === "ready") return true;
      if (phase.kind === "failed") return false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await stream
      .writeSSE({
        event: "phase",
        data: JSON.stringify({
          kind: "failed",
          reason: "unknown",
          message,
        } satisfies ClaimPhase),
      })
      .catch(() => {});
  } finally {
    clearInterval(watchdog);
  }
  return false;
}

/**
 * Budget for the "lifecycle says ready but mesh hasn't finished its
 * post-Ready bookkeeping" race. The Sandbox CR Ready=True signal fires the
 * moment the operator's reconciliation completes; `runner.ensure()` then
 * does Service-patch + HTTPRoute-mint + port-forward + daemon health probe
 * before inserting the state-store row that `proxyDaemonRequest` reads. In
 * a real cluster that post-Ready window is typically 2–10s. Without this
 * retry the unified stream would 404 here, emit `gone`, and force the
 * browser to reconnect — the symptom that motivated this fix.
 */
const PROXY_OPEN_RETRY_BUDGET_MS = 60_000;
const PROXY_OPEN_RETRY_DELAY_MS = 500;

/**
 * Open the daemon's `/_decopilot_vm/events` SSE through the runner and pipe
 * raw bytes to the client. Daemon emits a stable wire format the browser's
 * EventSource already groks, so byte-passthrough preserves event names,
 * payloads, and frame boundaries without parsing.
 *
 * 404 handling: retry within `PROXY_OPEN_RETRY_BUDGET_MS` rather than
 * surfacing `gone` immediately. The most common cause of an immediate 404
 * is the lifecycle-vs-ensure race described above — `gone` is reserved for
 * genuine eviction, where the handle is absent from K8s + state-store after
 * the budget expires.
 *
 * Non-404 upstream failure → `failed` phase. Caller's UI surfaces the
 * existing error state.
 */
async function proxyDaemonEvents(args: {
  stream: import("hono/streaming").SSEStreamingApi;
  runner: NonNullable<Awaited<ReturnType<typeof getOrInitSharedRunner>>>;
  claimName: string;
  signal: AbortSignal;
}): Promise<void> {
  const { stream, runner, claimName, signal } = args;

  const openedAt = Date.now();
  let upstream: Response | null = null;

  while (!signal.aborted) {
    let attempt: Response | null = null;
    try {
      attempt = await runner.proxyDaemonRequest(
        claimName,
        "/_decopilot_vm/events",
        {
          method: "GET",
          headers: new Headers({ accept: "text/event-stream" }),
          body: null,
          signal,
        },
      );
    } catch (err) {
      if (signal.aborted) return;
      // Network-level failure (port-forward not yet open, daemon health
      // probe still failing, ...). Same race window as 404 — retry, then
      // surface as failed if the budget elapses.
      if (Date.now() - openedAt < PROXY_OPEN_RETRY_BUDGET_MS) {
        await sleepAbortable(PROXY_OPEN_RETRY_DELAY_MS, signal);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      await stream
        .writeSSE({
          event: "phase",
          data: JSON.stringify({
            kind: "failed",
            reason: "unknown",
            message: `Upstream daemon SSE error: ${message}`,
          } satisfies ClaimPhase),
        })
        .catch(() => {});
      return;
    }

    if (attempt.status === 404) {
      try {
        await attempt.body?.cancel();
      } catch {
        /* ignore */
      }
      if (Date.now() - openedAt < PROXY_OPEN_RETRY_BUDGET_MS) {
        await sleepAbortable(PROXY_OPEN_RETRY_DELAY_MS, signal);
        continue;
      }
      // Budget elapsed and handle still missing — genuine eviction. Emit
      // `gone` so the client's self-heal (VM_START) takes over.
      await stream.writeSSE({ event: "gone", data: "" }).catch(() => {});
      return;
    }

    if (!attempt.ok || !attempt.body) {
      try {
        await attempt.body?.cancel();
      } catch {
        /* ignore */
      }
      await stream
        .writeSSE({
          event: "phase",
          data: JSON.stringify({
            kind: "failed",
            reason: "unknown",
            message: `Upstream daemon SSE failed (${attempt.status}).`,
          } satisfies ClaimPhase),
        })
        .catch(() => {});
      return;
    }

    upstream = attempt;
    break;
  }

  if (!upstream || !upstream.body) return;

  const reader = upstream.body.getReader();
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) await stream.write(value);
    }
  } catch {
    // Upstream errored or client aborted mid-read. Either way we're done —
    // the client will EventSource-reconnect if it wants to keep watching.
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/** Sleep that resolves immediately when the abort signal fires. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Combine two AbortSignals into one. Aborts whenever either source aborts.
 * Used so the lifecycle generator stops both on client disconnect *and* on
 * the no-claim watchdog tripping.
 */
function composeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const composed = new AbortController();
  const onAbortA = () => composed.abort();
  const onAbortB = () => composed.abort();
  a.addEventListener("abort", onAbortA, { once: true });
  b.addEventListener("abort", onAbortB, { once: true });
  return composed.signal;
}

export const vmEventsRoutes = app;

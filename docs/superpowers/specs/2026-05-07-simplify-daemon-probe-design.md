# Simplify daemon upstream probe

**Status:** approved, ready for implementation plan
**Author:** brainstormed with claude (gimenes)
**Date:** 2026-05-07

## Summary

Replace the daemon's port-discovery + scoring probe with a single-port HEAD poller. The configured port (`application.port`, renamed from `desiredPort`) becomes the only port the daemon ever forwards to, eliminating descendant-process port discovery, port scoring, and the probe-writeback feedback loop into `proxy.targetPort`.

The new probe broadcasts an explicit 3-state status (`booting | online | offline`) on SSE, polls every 1 s when not online and every 30 s when online, with single-flight 5 s HEAD timeouts.

## Motivation

The current probe (`packages/sandbox/daemon/probe.ts`, ~285 LOC + `port-discovery.ts` ~342 LOC) exists to *discover* which port a dev server actually bound, because frameworks may shift on port collisions and bind sidecar listeners. In the sandboxed runtime, this complexity isn't earning its keep:

- The sandbox is containerized; port collisions inside the box are rare.
- Mesh always supplies `desiredPort` (every runner defaults to 3000 if the workload doesn't specify), and that value flows through to the dev script as the `PORT` env var.
- The probe writes its discovered port back to `proxy.targetPort`, which triggers a `proxy-retarget` transition in the orchestrator that is a no-op. Pure feedback loop.
- The probe broadcasts a `ports[]` array on SSE that no UI code consumes.
- The probe broadcasts `responded` and `ready` booleans whose combinations the UI re-derives into a discriminated state (`PreviewState`). The probe should emit the discriminated state directly.

Net effect: ~790 LOC of subsystem (probe + port-discovery + tests) collapses to ~100 LOC, with clearer state semantics for the UI.

## Non-goals

- Detecting when a framework refuses to honor the `PORT` env var. If `application.port = 3000` and the dev server binds 3001 instead, the proxy returns ECONNREFUSED and the user fixes their config. This is the documented contract, not a failure mode the daemon will paper over.
- Backward-compatible SSE wire format. Daemon and mesh ship together; the SSE event shape is changing.
- Backward-compatible config field names. `desiredPort → port` is a one-shot rename across the daemon, mesh runners, and tests.

## Design

### Public probe surface

```ts
// packages/sandbox/daemon/probe.ts (rewrite)

export type UpstreamStatus =
  | "booting"   // never responded on the current port (covers boot window too)
  | "online"    // last HEAD got an HTTP response (any status 100–599)
  | "offline";  // ever-responded on the current port; current HEAD failing

export interface ProbeState {
  status: UpstreamStatus;
  port: number | null;   // null only during pre-config boot window
  htmlSupport: boolean;  // sticky on offline; updated on every online HEAD
}

export interface ProbeDeps {
  getPort: () => number | null;       // reads config.application.port
  onChange: (state: ProbeState) => void;
  onLog?: (msg: string) => void;
}

export function startUpstreamProbe(deps: ProbeDeps): ProbeState;
```

Dropped from the public state: `ready`, `responded`, `ports[]`. The `ready` boolean was unused in the UI (only mentioned in stale comments). `responded` is subsumed by `status !== "booting"`. `ports[]` had no consumers.

### State machine

```
   start ─────────► booting
                       │
                       │  HEAD returns HTTP response
                       ▼
                    online ◄───── HEAD returns HTTP response ───── offline
                       │                                              ▲
                       │  HEAD fails (ECONNREFUSED/timeout/network)   │
                       └──────────────────────────────────────────────┘

   any state + port changes (incl. null→number, number→number') → booting
```

| From | Event | To |
|---|---|---|
| `booting` | HEAD returns HTTP response | `online` |
| `online` | HEAD fails | `offline` |
| `offline` | HEAD returns HTTP response | `online` |
| any | `port` changes | `booting` |

### Cadence

| Status | Interval |
|---|---|
| `booting` | `PROBE_FAST_MS` (1000 ms) |
| `online` | `PROBE_SLOW_MS` (30000 ms) |
| `offline` | `PROBE_FAST_MS` (1000 ms) |

Cadence is a pure function of the current status — no separate latch. The actual interval between HEADs is `max(cadence, head_duration)` because of single-flight (see below).

### Per-tick algorithm

```ts
let lastProbedPort: number | null = null;
let status: UpstreamStatus = "booting";
let htmlSupport = false;
let inFlight = false;

async function tick() {
  const port = getPort();

  // Port changed (PUT /config retarget, or first config arrival).
  if (port !== lastProbedPort) {
    lastProbedPort = port;
    status = "booting";
    htmlSupport = false;
    emit({ status, port, htmlSupport });
  }

  if (port === null) {
    // Pre-config boot window: stay in booting, don't fire HEAD.
    schedule(PROBE_FAST_MS);
    return;
  }

  if (inFlight) {
    schedule(status === "online" ? PROBE_SLOW_MS : PROBE_FAST_MS);
    return;
  }

  inFlight = true;
  const result = await head(`http://localhost:${port}/`, PROBE_HEAD_TIMEOUT_MS);
  inFlight = false;

  // Discard result if port changed mid-flight.
  if (port !== lastProbedPort) {
    schedule(PROBE_FAST_MS);
    return;
  }

  if (result !== null) {
    if (status === "booting") {
      onLog?.(`[probe] server responded on port ${port} (status ${result.status})\r\n`);
    }
    status = "online";
    htmlSupport = result.isHtml;
  } else {
    if (status === "online") {
      onLog?.(`[probe] server stopped responding on port ${port}\r\n`);
      status = "offline";
    }
    // status="booting" stays "booting"; status="offline" stays "offline".
    // htmlSupport sticky in offline; reset only on port change.
  }

  emitIfChanged({ status, port, htmlSupport });
  schedule(status === "online" ? PROBE_SLOW_MS : PROBE_FAST_MS);
}
```

### Single-flight HEAD

`fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) })` returns `{ ok, status, isHtml }` on any HTTP response, or `null` on `ECONNREFUSED` / `AbortError` / network error. `isHtml` is derived from `(content-type ?? "").toLowerCase().includes("text/html")`.

While `inFlight === true`, ticks are skipped. This means a Vite/Next cold-compile that takes 8 s blocks one HEAD, and the next HEAD is fired after the first returns + the next scheduled tick — never queueing.

### Wire-up in `entry.ts`

```ts
const lastStatus = startUpstreamProbe({
  getPort: () => store.read()?.application?.port ?? null,
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
    if (s.status === "online" && s.port !== null) appService.markUp();
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
});

const getDevPort = (): number | null => store.read()?.application?.port ?? null;
```

`getDevPort()` reads config directly — it does NOT consult probe state. The proxy forwards to the configured port unconditionally; existing ECONNREFUSED handling in `proxy.ts:54-72` already shows a "Server is starting…" page on early misses.

`appService.markUp()` fires on first `booting → online` transition. Idempotent on the appService side.

### File-level changes

**Rewritten:**
- `packages/sandbox/daemon/probe.ts` — ~285 LOC → ~80 LOC.
- `packages/sandbox/daemon/probe.test.ts` — replace `selectActive` tests with state-machine and single-flight tests using a fake clock and fake `head`.

**Deleted:**
- `packages/sandbox/daemon/process/port-discovery.ts` (sole consumer was the probe).

**Renamed (one-shot, end-to-end):**
- `Application.desiredPort` → `Application.port` in `daemon/types.ts`.
- `Transition.kind === "desired-port-change"` → `"port-change"` in `daemon/config-store/types.ts`, `classify.ts`, `orchestrator.ts`.
- `desiredPort` parameter → `port` in `packages/sandbox/server/runner/shared/build-config-payload.ts` and the three runner call sites (`host/runner.ts`, `docker/runner.ts`, `agent-sandbox/runner.ts`).
- `buildDevEnv` in `daemon/constants.ts` reads `config.application.port`.

**Removed (no replacement):**
- `ProxyConfig` interface and `Application.proxy` field in `daemon/types.ts`.
- `Transition.kind === "proxy-retarget"` in `daemon/config-store/types.ts` and the orchestrator case.
- `proxy.targetPort` validation in `daemon/validate.ts`.
- `getDiscoveredPorts` closure and `lastWrittenProxyPort` writeback in `entry.ts`.
- Probe constants `FAST_PROBE_MS`, `SLOW_PROBE_MS`, `FAST_PROBE_LIMIT` (replaced by `PROBE_FAST_MS = 1000`, `PROBE_SLOW_MS = 30_000`, `PROBE_HEAD_TIMEOUT_MS = 5_000`).
- All `proxy: {}` references in test fixtures (`config.test.ts`, `exec.test.ts`, `classify.test.ts`, `merge.test.ts`).

**SSE event shape change** (`daemon/events/sse.ts:5-12` and consumers in `apps/mesh/src/web/components/vm/`):

Before:
```json
{ "type": "status", "ready": false, "responded": false, "htmlSupport": false, "port": null, "ports": [] }
```

After:
```json
{ "type": "status", "status": "booting", "port": null, "htmlSupport": false }
```

Mesh-side updates:
- `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx` — replace `ready`/`responded`/`htmlSupport` parsing (lines 45-46, 111, 176-177, 209-210, 287-288, 317-319) with `status`/`htmlSupport`.
- `apps/mesh/src/web/components/vm/preview/preview.tsx` — `vmEvents.status.responded` → `vmEvents.status.status !== "booting"`. `vmEvents.status.htmlSupport` unchanged.
- `apps/mesh/src/web/components/vm/preview/preview-state.ts` — `responded` field becomes `status: UpstreamStatus`. `bootEverReady` becomes redundant: `status === "online" || status === "offline"` is the same latch. Drop `bootEverReady` from `PreviewStateInput`.
- All `preview-state.test.ts` and related tests updated.

## Error handling

All HEAD failure modes (`ECONNREFUSED`, `AbortError` from 5 s timeout, network errors, partial responses) collapse to "no response." The probe doesn't discriminate — its only response to failure is "try again on the next tick."

The 5 s HEAD timeout vs 8–20 s cold-compile pattern: the first HEAD aborts at 5 s, the dev server's compile continues server-side (HEAD abort doesn't kill it), and a subsequent HEAD lands once compile finishes. Status stays `booting` across the failed HEADs, then flips to `online` on first success. Effective wait is the same as today's 30 s blocking probe, with finer-grained reporting.

`PUT /config` mid-flight: the in-flight HEAD's result is discarded by the post-await `port !== lastProbedPort` check. Worst case: one wasted HEAD before the new port is probed.

Daemon shutdown: track the latest `setTimeout` handle in a closure, clear on shutdown. Same pattern as today's `probe.ts:282`.

## Testing

**Unit (Bun test, fake clock + fake `head`):**
- Each state transition: `booting → online`, `online → offline`, `offline → online`, port change → `booting`.
- Single-flight: while a HEAD is pending, ticks skip without firing a second HEAD.
- Cadence selection: `booting`/`offline` schedule at 1 s, `online` at 30 s.
- Boot window: `getPort()` returning `null` keeps state `booting`, no HEAD fired.
- Port-change mid-flight: result discarded.

**Integration (existing `daemon.e2e.test.ts`):**
- Update `responded`/`ready` assertions to `status: "online"` / `"booting"`.

**Tests deleted:**
- `selectActive` tests in `probe.test.ts`.
- `proxy-retarget` transition tests in `classify.test.ts`.
- `proxy.targetPort` writeback tests in `merge.test.ts`, `config.test.ts`.

**Tests updated for rename:**
- `desiredPort` → `port` in `config.test.ts`, `merge.test.ts`, `classify.test.ts`, `runner.test.ts`.
- `desired-port-change` → `port-change` in transition assertions.

**Accepted coverage gap:** no end-to-end test for the cold-compile-with-5s-timeout sequence. The unit tests cover the equivalent logic with deterministic fakes.

## Migration

One PR, no flag, no compat shim. Daemon and mesh ship together; the SSE event shape change is observable in dev only after both sides are merged. The rename `desiredPort → port` is also one-shot.

Manual verification before merge:
1. Boot a sandbox with a Next.js app on port 3000. Observe `status: "booting"` for cold-compile duration, then `status: "online"`. Iframe renders.
2. Boot a sandbox with an API-only app returning 404 at `/`. Observe `status: "online"` (treat-404-as-up), `htmlSupport: false`, "no-html" preview state.
3. Kill the dev process inside the sandbox. Observe `status: "offline"` within ~30 s (next slow tick), then fast polling resumes.
4. `PUT /config` with a different `port`. Observe `status: "booting"` immediately, then `online` once the dev server restarts on the new port.

## Out of scope (followups)

- Reporting an explicit error if `application.port` is set but the dev script binds a different port. Today's behavior (ECONNREFUSED indefinitely, "Server is starting…" overlay) is acceptable.
- A `/healthz`-aware probe (some frameworks expose this; we'd need per-framework knowledge).
- Probing multiple ports for "switch to port N" UX. The current probe broadcasts `ports[]` for this, but there are no consumers; if the feature is wanted later, it can be re-added against this simpler base.

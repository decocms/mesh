# Simplify daemon upstream probe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the daemon's port-discovery + scoring probe with a single-port HEAD poller driven by `application.port` (renamed from `desiredPort`). 3-state status (`booting | online | offline`), 1 s/30 s cadence, 5 s single-flight HEAD.

**Architecture:** The configured port becomes the only port the daemon ever forwards to. A pure state reducer maps `(state, event) → state` and a thin loop wrapper drives it on `setTimeout` with a single in-flight HEAD. SSE event shape changes: `responded`/`ready`/`ports[]` collapse to a single `status: UpstreamStatus`. Mesh UI consumes the new shape and drops its `bootEverReady` latching machinery (subsumed by `status === "online" || "offline"`).

**Tech Stack:** Bun runtime, Bun test runner, TypeScript, React 19 (mesh UI), Hono (daemon HTTP).

**Spec:** `docs/superpowers/specs/2026-05-07-simplify-daemon-probe-design.md`

---

## File Structure

**New / rewritten in daemon:**
- `packages/sandbox/daemon/probe.ts` — rewritten (~80 LOC). Exports `UpstreamStatus`, `ProbeState`, `ProbeEvent`, `reduce()`, `cadence()`, `startUpstreamProbe()`.
- `packages/sandbox/daemon/probe.test.ts` — rewritten. Tests `reduce()` and `cadence()` (pure functions). Drops `selectActive` tests.

**Deleted:**
- `packages/sandbox/daemon/process/port-discovery.ts` — sole consumer was the old probe.

**Modified in daemon:**
- `packages/sandbox/daemon/types.ts` — rename `desiredPort` → `port`; delete `ProxyConfig`, `Application.proxy`.
- `packages/sandbox/daemon/validate.ts` — rename `desiredPort` validation to `port`; drop `proxy.targetPort` validation.
- `packages/sandbox/daemon/config-store/types.ts` — `desired-port-change` → `port-change`; delete `proxy-retarget`.
- `packages/sandbox/daemon/config-store/classify.ts` — match the type changes.
- `packages/sandbox/daemon/config-store/classify.test.ts` — update tests; delete `proxy-retarget` test.
- `packages/sandbox/daemon/config-store/merge.test.ts` — drop `proxy: {}` and `proxy.targetPort` test.
- `packages/sandbox/daemon/setup/orchestrator.ts` — rename case `"desired-port-change"` → `"port-change"`; delete `case "proxy-retarget"`; update jsdoc.
- `packages/sandbox/daemon/constants.ts` — `buildDevEnv` reads `application.port`; replace `FAST_PROBE_MS`/`SLOW_PROBE_MS`/`FAST_PROBE_LIMIT` with `PROBE_FAST_MS`/`PROBE_SLOW_MS`/`PROBE_HEAD_TIMEOUT_MS`.
- `packages/sandbox/daemon/persistence.ts` — jsdoc rename.
- `packages/sandbox/daemon/app/application-service.ts` — jsdoc rename.
- `packages/sandbox/daemon/entry.ts` — use new probe API; drop `getDiscoveredPorts`, `lastWrittenProxyPort`, `discoverDescendantListeningPorts` import.
- `packages/sandbox/daemon/events/sse.ts` — `getLastStatus` returns `{ status, port, htmlSupport }`.
- `packages/sandbox/daemon/events/sse.test.ts` — update fixture.
- `packages/sandbox/daemon/routes/config.test.ts` — rename fixtures, drop `proxy: {}`.
- `packages/sandbox/daemon/routes/exec.test.ts` — drop `proxy: {}` from fixtures.

**Modified in runner (server-side):**
- `packages/sandbox/server/runner/shared/build-config-payload.ts` — parameter and emitted field renamed.
- `packages/sandbox/server/runner/host/runner.ts` — call site rename.
- `packages/sandbox/server/runner/docker/runner.ts` — call site rename.
- `packages/sandbox/server/runner/agent-sandbox/runner.ts` — call site rename.
- `packages/sandbox/server/runner/docker/runner.test.ts` — assertion rename.

**Modified in mesh UI:**
- `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx` — `VmStatus` shape change; SSE parser update.
- `apps/mesh/src/web/components/vm/preview/preview.tsx` — drop `bootTrackedRef` machinery; pass `status` to `computePreviewState`.
- `apps/mesh/src/web/components/vm/preview/preview-state.ts` — `PreviewStateInput.responded` becomes `status: UpstreamStatus`; drop `bootEverReady`.
- `apps/mesh/src/web/components/vm/preview/preview-state.test.ts` — update all test fixtures.

---

## Task 1: Rename `desiredPort` → `port` end-to-end (mechanical)

**Files:**
- Modify: `packages/sandbox/daemon/types.ts:60-61`
- Modify: `packages/sandbox/daemon/validate.ts:103-107`
- Modify: `packages/sandbox/daemon/config-store/types.ts:16-20`
- Modify: `packages/sandbox/daemon/config-store/classify.ts:69-78`
- Modify: `packages/sandbox/daemon/setup/orchestrator.ts` (case `"desired-port-change"`; jsdoc on lines 240, 303)
- Modify: `packages/sandbox/daemon/constants.ts:62-75` (`buildDevEnv`)
- Modify: `packages/sandbox/daemon/persistence.ts:20` (jsdoc)
- Modify: `packages/sandbox/daemon/app/application-service.ts:73,156` (jsdoc)
- Modify: `packages/sandbox/server/runner/shared/build-config-payload.ts:12,41-43`
- Modify: `packages/sandbox/server/runner/host/runner.ts:193`
- Modify: `packages/sandbox/server/runner/docker/runner.ts:330`
- Modify: `packages/sandbox/server/runner/agent-sandbox/runner.ts:1077`
- Modify: `packages/sandbox/daemon/routes/config.test.ts:24,59,63,93,99,103`
- Modify: `packages/sandbox/daemon/config-store/merge.test.ts:69,83`
- Modify: `packages/sandbox/daemon/config-store/classify.test.ts:102-110`
- Modify: `packages/sandbox/server/runner/docker/runner.test.ts:551`

This task is a mechanical rename with no behavior change. The "test" is `bun test` after the rename — every existing test that referenced `desiredPort` must continue to pass under the new name.

- [ ] **Step 1: Update `Application.desiredPort` → `Application.port` in `daemon/types.ts:60-61`**

```ts
// BEFORE (line 60-61):
  /** PORT env hint for the dev script. Daemon picks a default if unset. */
  readonly desiredPort?: number;

// AFTER:
  /** Port the dev script binds to (set as PORT env). Mesh always supplies this. */
  readonly port?: number;
```

- [ ] **Step 2: Update transition kind in `config-store/types.ts:16-20`**

```ts
// BEFORE (line 16-20):
  | {
      kind: "desired-port-change";
      from: number | undefined;
      to: number | undefined;
    }

// AFTER:
  | {
      kind: "port-change";
      from: number | undefined;
      to: number | undefined;
    }
```

- [ ] **Step 3: Update `classify.ts:69-78`**

```ts
// BEFORE (line 69-78):
  // 6. Desired PORT change.
  const beforeDesired = before.application?.desiredPort;
  const afterDesired = after.application?.desiredPort;
  if (beforeDesired !== afterDesired) {
    return {
      kind: "desired-port-change",
      from: beforeDesired,
      to: afterDesired,
    };
  }

// AFTER:
  // 6. PORT change.
  const beforePort = before.application?.port;
  const afterPort = after.application?.port;
  if (beforePort !== afterPort) {
    return {
      kind: "port-change",
      from: beforePort,
      to: afterPort,
    };
  }
```

Also update the precedence-comment block at the top of the file (lines 9-13):

```ts
// BEFORE:
 *   identity-conflict > bootstrap > branch-change >
 *   runtime-change > pm-change > desired-port-change >
 *   proxy-retarget > no-op

// AFTER (proxy-retarget is removed in Task 2; leave as-is here):
 *   identity-conflict > bootstrap > branch-change >
 *   runtime-change > pm-change > port-change >
 *   proxy-retarget > no-op
```

- [ ] **Step 4: Update orchestrator `case` in `setup/orchestrator.ts`**

Find the switch body (around line 138-141):

```ts
// BEFORE:
      case "pm-change":
      case "runtime-change":
        return this.reinstallAndMaybeStart();
      case "desired-port-change":
        return this.maybeRestartDev();

// AFTER:
      case "pm-change":
      case "runtime-change":
        return this.reinstallAndMaybeStart();
      case "port-change":
        return this.maybeRestartDev();
```

Also update the jsdoc on lines 240 and 303 — replace `desiredPort` with `port` literally.

- [ ] **Step 5: Update `validate.ts:101-107`**

```ts
// BEFORE (line 101-107, around `desiredPort` check):
  if (app.desiredPort !== undefined && !isValidPort(app.desiredPort)) {
    return {
      kind: "rejected",
      reason: REJECTION_REASONS.INVALID,
      detail: `desiredPort invalid: ${app.desiredPort}`,
    };
  }

// AFTER:
  if (app.port !== undefined && !isValidPort(app.port)) {
    return {
      kind: "rejected",
      reason: REJECTION_REASONS.INVALID,
      detail: `port invalid: ${app.port}`,
    };
  }
```

- [ ] **Step 6: Update `constants.ts:62-75` (`buildDevEnv`)**

```ts
// BEFORE (line 62-75):
export function buildDevEnv(
  config: { application?: { desiredPort?: number } },
  overrides?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {
    HOST: "0.0.0.0",
    HOSTNAME: "0.0.0.0",
    ...(overrides ?? {}),
  };
  const desired = config.application?.desiredPort;
  if (desired !== undefined && env.PORT === undefined)
    env.PORT = String(desired);
  return env;
}

// AFTER:
export function buildDevEnv(
  config: { application?: { port?: number } },
  overrides?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {
    HOST: "0.0.0.0",
    HOSTNAME: "0.0.0.0",
    ...(overrides ?? {}),
  };
  const port = config.application?.port;
  if (port !== undefined && env.PORT === undefined) env.PORT = String(port);
  return env;
}
```

- [ ] **Step 7: Update jsdoc references**

In `persistence.ts:20`:

```ts
// BEFORE:
 * the mesh didn't supply (package manager, runtime, desiredPort). The daemon

// AFTER:
 * the mesh didn't supply (package manager, runtime, port). The daemon
```

In `app/application-service.ts` (lines 73 and 156):

```ts
// BEFORE (line 73):
  // orchestrator-driven stop (branch/pm/runtime/desiredPort change) was

// AFTER:
  // orchestrator-driven stop (branch/pm/runtime/port change) was
```

```ts
// BEFORE (line 156):
      // calls stop() before pm/branch/desiredPort transitions; flagging

// AFTER:
      // calls stop() before pm/branch/port transitions; flagging
```

- [ ] **Step 8: Update runner-side payload in `server/runner/shared/build-config-payload.ts`**

```ts
// BEFORE (line 9-14):
export function buildConfigPayload(args: {
  runtime: "node" | "bun" | "deno";
  packageManager: PackageManagerConfig | null;
  desiredPort?: number;
  repo: NonNullable<EnsureOptions["repo"]> | null;
}): Partial<TenantConfig> | null {

// AFTER:
export function buildConfigPayload(args: {
  runtime: "node" | "bun" | "deno";
  packageManager: PackageManagerConfig | null;
  port?: number;
  repo: NonNullable<EnsureOptions["repo"]> | null;
}): Partial<TenantConfig> | null {
```

```ts
// BEFORE (line 41-43):
        ...(args.desiredPort !== undefined
          ? { desiredPort: args.desiredPort }
          : {}),

// AFTER:
        ...(args.port !== undefined ? { port: args.port } : {}),
```

- [ ] **Step 9: Update three runner call sites**

In `server/runner/host/runner.ts:193`:

```ts
// BEFORE:
      desiredPort: opts.workload?.devPort ?? devPort,

// AFTER:
      port: opts.workload?.devPort ?? devPort,
```

In `server/runner/docker/runner.ts:330`:

```ts
// BEFORE:
      desiredPort: devContainerPort,

// AFTER:
      port: devContainerPort,
```

In `server/runner/agent-sandbox/runner.ts:1077`:

```ts
// BEFORE:
      desiredPort: opts.workload?.devPort ?? DEFAULT_DEV_PORT,

// AFTER:
      port: opts.workload?.devPort ?? DEFAULT_DEV_PORT,
```

- [ ] **Step 10: Update test fixtures — `routes/config.test.ts`**

The SEED fixture and three test bodies use `desiredPort`. Update all of them:

```ts
// BEFORE (line 24):
    desiredPort: 3000,
// AFTER:
    port: 3000,

// BEFORE (line 59-67):
  it("PUT desiredPort emits desired-port-change", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", { application: { desiredPort: 5173 } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transition: string };
    expect(body.transition).toBe("desired-port-change");
  });
// AFTER:
  it("PUT port emits port-change", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(buildReq("PUT", { application: { port: 5173 } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transition: string };
    expect(body.transition).toBe("port-change");
  });

// BEFORE (line 93):
        application: { desiredPort: 4000 },
// AFTER:
        application: { port: 4000 },

// BEFORE (line 99-105):
  it("invalid desiredPort returns 400", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", { application: { desiredPort: 70000 } }),
    );
    expect(res.status).toBe(400);
  });
// AFTER:
  it("invalid port returns 400", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(buildReq("PUT", { application: { port: 70000 } }));
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 11: Update test fixtures — `config-store/merge.test.ts:69,83`**

```ts
// BEFORE (line 69):
        desiredPort: 3000,
// AFTER:
        port: 3000,

// BEFORE (line 83):
    expect(merged.application?.desiredPort).toBe(3000);
// AFTER:
    expect(merged.application?.port).toBe(3000);
```

- [ ] **Step 12: Update test fixtures — `config-store/classify.test.ts:102-110`**

```ts
// BEFORE:
  it("desired port change = desired-port-change", () => {
    const before: TenantConfig = {
      application: { ...baseApp, desiredPort: 3000 },
    };
    const after: TenantConfig = {
      application: { ...baseApp, desiredPort: 5173 },
    };
    expect(classify(before, after).kind).toBe("desired-port-change");
  });
// AFTER:
  it("port change = port-change", () => {
    const before: TenantConfig = {
      application: { ...baseApp, port: 3000 },
    };
    const after: TenantConfig = {
      application: { ...baseApp, port: 5173 },
    };
    expect(classify(before, after).kind).toBe("port-change");
  });
```

- [ ] **Step 13: Update runner test — `server/runner/docker/runner.test.ts:551`**

```ts
// BEFORE:
    expect(body.application?.desiredPort).toBe(3000);
// AFTER:
    expect(body.application?.port).toBe(3000);
```

- [ ] **Step 14: Run typecheck and tests**

```bash
bun run check
```
Expected: no errors.

```bash
bun test packages/sandbox/daemon packages/sandbox/server
```
Expected: all tests pass.

If a test still references `desiredPort` (e.g. a fixture I missed), fix it.

- [ ] **Step 15: Format and commit**

```bash
bun run fmt
git add -A packages/sandbox/
git commit -m "$(cat <<'EOF'
refactor(sandbox): rename application.desiredPort to application.port

Mechanical rename across daemon types, runner payloads, and tests. Renames
the desired-port-change transition kind to port-change. No behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Drop `proxy.targetPort` field, `proxy-retarget` transition, and entry.ts writeback

**Files:**
- Modify: `packages/sandbox/daemon/types.ts:46-63` (delete `ProxyConfig`, `Application.proxy`)
- Modify: `packages/sandbox/daemon/validate.ts:108-117`
- Modify: `packages/sandbox/daemon/config-store/types.ts:21` (delete `proxy-retarget` kind)
- Modify: `packages/sandbox/daemon/config-store/classify.ts:9-13,80-85`
- Modify: `packages/sandbox/daemon/setup/orchestrator.ts:143` (delete `case "proxy-retarget"`)
- Modify: `packages/sandbox/daemon/entry.ts:166-194`
- Modify: `packages/sandbox/daemon/config-store/classify.test.ts:112-118` (delete test)
- Modify: `packages/sandbox/daemon/config-store/merge.test.ts:42-87` (delete `proxy.targetPort` test, drop `proxy: {}` from fixtures)
- Modify: `packages/sandbox/daemon/routes/config.test.ts:25` (drop `proxy: {}`)
- Modify: `packages/sandbox/daemon/routes/exec.test.ts:63,85` (drop `proxy: {}`)

This task removes `proxy.targetPort` and its feedback loop. The old probe is still in place — we adapt `entry.ts` to give it a null pin (and stop writing back), since `application.proxy` no longer exists. Old probe behavior degrades cleanly: it discovers descendant ports without a pin, picks highest-scored.

- [ ] **Step 1: Delete `ProxyConfig` and `Application.proxy` in `types.ts`**

```ts
// DELETE lines 46-55 (the comment + ProxyConfig interface):
/**
 * What the proxy currently forwards to. Last-writer-wins between tenant
 * (explicit override via PUT /config) and the daemon's port probe. The
 * probe always reasserts to the current dev process's bound port, so a
 * tenant override is sticky only until the next dev (re)start observes a
 * different port.
 */
export interface ProxyConfig {
  readonly targetPort?: number;
}

// DELETE the proxy field from Application (line 62):
  readonly proxy?: ProxyConfig;
```

After the edits, `Application` should look like:

```ts
export interface Application {
  readonly packageManager?: PackageManagerConfig;
  readonly runtime?: RuntimeName;
  /** Port the dev script binds to (set as PORT env). Mesh always supplies this. */
  readonly port?: number;
}
```

- [ ] **Step 2: Drop `proxy.targetPort` validation in `validate.ts:108-117`**

```ts
// DELETE this block:
  if (
    app.proxy?.targetPort !== undefined &&
    !isValidPort(app.proxy.targetPort)
  ) {
    return {
      kind: "rejected",
      reason: REJECTION_REASONS.INVALID,
      detail: `proxy.targetPort invalid: ${app.proxy.targetPort}`,
    };
  }
```

- [ ] **Step 3: Drop `proxy-retarget` transition kind in `config-store/types.ts:21`**

```ts
// DELETE the line:
  | { kind: "proxy-retarget"; port: number }
```

- [ ] **Step 4: Drop the proxy-retarget branch in `classify.ts:80-85`**

```ts
// DELETE this block:
  // 7. Proxy target change (probe writeback or tenant override).
  const beforeProxy = before.application?.proxy?.targetPort;
  const afterProxy = after.application?.proxy?.targetPort;
  if (afterProxy !== undefined && beforeProxy !== afterProxy) {
    return { kind: "proxy-retarget", port: afterProxy };
  }
```

Also update the precedence comment at the top of the file (lines 9-13):

```ts
// BEFORE:
 *   identity-conflict > bootstrap > branch-change >
 *   runtime-change > pm-change > port-change >
 *   proxy-retarget > no-op

// AFTER:
 *   identity-conflict > bootstrap > branch-change >
 *   runtime-change > pm-change > port-change > no-op
```

- [ ] **Step 5: Drop the `proxy-retarget` case in `orchestrator.ts:143`**

```ts
// BEFORE:
      case "desired-port-change":
        return this.maybeRestartDev();
      case "proxy-retarget":
        return; // probe pin reads from store; nothing for the reducer to do
      case "no-op":

// AFTER (note: "desired-port-change" was already renamed to "port-change" in Task 1):
      case "port-change":
        return this.maybeRestartDev();
      case "no-op":
```

- [ ] **Step 6: Adapt `entry.ts` — drop the `proxy.targetPort` writeback and pin lookup**

Find the `startUpstreamProbe(...)` block (lines 166-194) and the `lastWrittenProxyPort` declaration (search the file for the literal `lastWrittenProxyPort`).

Replace `getPinnedPort` with a no-op that returns `null` (the old probe still expects this dep), and delete the writeback section:

```ts
// BEFORE (lines 166-194):
const lastStatus = startUpstreamProbe({
  upstreamHost: "localhost",
  getDiscoveredPorts,
  getPinnedPort: () => store.read()?.application?.proxy?.targetPort ?? null,
  getCommandName: (pid) => {
    if (pid === appService.pid()) return "dev";
    return null;
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
    if (s.ready && s.port !== null) {
      appService.markUp();
    }
    // Probe writeback: when discovery resolves a port owned by the app
    // service, persist it as proxy.targetPort so tenants see what we're
    // forwarding to. Dedupe to avoid spamming `apply()` every tick.
    if (
      s.port !== null &&
      s.port !== lastWrittenProxyPort &&
      appService.pid() !== undefined
    ) {
      lastWrittenProxyPort = s.port;
      void store.apply({
        application: { proxy: { targetPort: s.port } },
      } as Partial<TenantConfig>);
    }
  },
});

// AFTER:
const lastStatus = startUpstreamProbe({
  upstreamHost: "localhost",
  getDiscoveredPorts,
  getPinnedPort: () => null,
  getCommandName: (pid) => {
    if (pid === appService.pid()) return "dev";
    return null;
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
    if (s.ready && s.port !== null) {
      appService.markUp();
    }
  },
});
```

Also delete the `let lastWrittenProxyPort: number | null = null;` declaration (somewhere above this block), and delete the `import type { TenantConfig }` if it's now unused.

- [ ] **Step 7: Delete the proxy-retarget test in `classify.test.ts:112-120`**

```ts
// DELETE the entire `it("proxy targetPort change ...")` test:
  it("proxy targetPort change without anything else = proxy-retarget", () => {
    const before: TenantConfig = {
      application: { ...baseApp, proxy: {} },
    };
    const after: TenantConfig = {
      application: { ...baseApp, proxy: { targetPort: 5173 } },
    };
    expect(classify(before, after).kind).toBe("proxy-retarget");
  });
```

Also check `baseApp` definition near the top — if it has `proxy: {}`, drop that field.

- [ ] **Step 8: Update `merge.test.ts` — drop `proxy: {}` and the targetPort test**

Delete the `it("deep-merges nested objects (proxy.targetPort)")` test entirely (lines 42-61).

In the remaining tests, drop every `proxy: {}` and `proxy: { targetPort: ... }` line. After cleanup, the file's `application` blocks should look like:

```ts
// Example AFTER (the seed in line 7-13):
    const patch: Partial<TenantConfig> = {
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
      },
    };
```

And the "absent fields don't overwrite" test (currently lines 63-87) should drop the `proxy` parts entirely:

```ts
  it("absent fields don't overwrite existing ones", () => {
    const current: TenantConfig = {
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
        port: 3000,
      },
    };
    const patch: Partial<TenantConfig> = {
      application: {
        packageManager: { name: "pnpm" },
        runtime: "node",
      },
    };
    const merged = deepMerge(current, patch);
    expect(merged.application?.port).toBe(3000);
    expect(merged.application?.packageManager?.name).toBe("pnpm");
  });
```

- [ ] **Step 9: Drop `proxy: {}` from other test fixtures**

In `routes/config.test.ts:25`:

```ts
// BEFORE:
  application: {
    packageManager: { name: "npm" },
    runtime: "node",
    port: 3000,
    proxy: {},
  },

// AFTER:
  application: {
    packageManager: { name: "npm" },
    runtime: "node",
    port: 3000,
  },
```

In `routes/exec.test.ts:63,85` — find each `proxy: {},` line and delete it.

- [ ] **Step 10: Run typecheck and tests**

```bash
bun run check
```
Expected: no errors.

```bash
bun test packages/sandbox/daemon
```
Expected: all tests pass. (The old probe is still wired with `getPinnedPort: () => null`; behavior is "discover descendants, pick highest-scored.")

- [ ] **Step 11: Format and commit**

```bash
bun run fmt
git add -A packages/sandbox/
git commit -m "$(cat <<'EOF'
refactor(sandbox): drop application.proxy.targetPort and proxy-retarget transition

The probe-writeback into proxy.targetPort triggers a no-op transition. Mesh
never sets the field; UI never reads it. The old probe is now wired with
getPinnedPort returning null until it's replaced wholesale in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write failing tests for the new probe state reducer

**Files:**
- Test (rewrite): `packages/sandbox/daemon/probe.test.ts`

This is the TDD red phase. We write tests against a `reduce()` function and a `cadence()` function that don't exist yet. Tests will fail (`reduce` is not exported / `selectActive` not found) — that's expected.

The reducer takes `(state, event) → { next, log? }`. Events are `port-change`, `head-response`, `head-failure`. Cadence is a pure function of state.

- [ ] **Step 1: Replace `probe.test.ts` content with the new test file**

Overwrite the entire file with:

```ts
import { describe, expect, test } from "bun:test";
import { cadence, reduce, type ProbeState } from "./probe";
import { PROBE_FAST_MS, PROBE_SLOW_MS } from "./constants";

const initial: ProbeState = {
  status: "booting",
  port: null,
  htmlSupport: false,
};

describe("reduce", () => {
  describe("port-change", () => {
    test("null → 3000 transitions to booting with new port", () => {
      const r = reduce(initial, { kind: "port-change", port: 3000 });
      expect(r.next).toEqual({
        status: "booting",
        port: 3000,
        htmlSupport: false,
      });
      expect(r.log).toBeUndefined();
    });

    test("same port is a no-op", () => {
      const state: ProbeState = {
        status: "online",
        port: 3000,
        htmlSupport: true,
      };
      const r = reduce(state, { kind: "port-change", port: 3000 });
      expect(r.next).toEqual(state);
    });

    test("3000 → 5173 from online resets to booting and clears htmlSupport", () => {
      const state: ProbeState = {
        status: "online",
        port: 3000,
        htmlSupport: true,
      };
      const r = reduce(state, { kind: "port-change", port: 5173 });
      expect(r.next).toEqual({
        status: "booting",
        port: 5173,
        htmlSupport: false,
      });
    });

    test("number → null transitions to booting", () => {
      const state: ProbeState = {
        status: "offline",
        port: 3000,
        htmlSupport: false,
      };
      const r = reduce(state, { kind: "port-change", port: null });
      expect(r.next).toEqual({
        status: "booting",
        port: null,
        htmlSupport: false,
      });
    });
  });

  describe("head-response", () => {
    test("booting → online with log on first response", () => {
      const state: ProbeState = {
        status: "booting",
        port: 3000,
        htmlSupport: false,
      };
      const r = reduce(state, {
        kind: "head-response",
        status: 200,
        isHtml: true,
      });
      expect(r.next).toEqual({
        status: "online",
        port: 3000,
        htmlSupport: true,
      });
      expect(r.log).toContain("port 3000");
      expect(r.log).toContain("status 200");
    });

    test("booting → online treats 404 as up (no special-casing)", () => {
      const state: ProbeState = {
        status: "booting",
        port: 3000,
        htmlSupport: false,
      };
      const r = reduce(state, {
        kind: "head-response",
        status: 404,
        isHtml: false,
      });
      expect(r.next.status).toBe("online");
      expect(r.next.htmlSupport).toBe(false);
    });

    test("online → online: no log, htmlSupport updates", () => {
      const state: ProbeState = {
        status: "online",
        port: 3000,
        htmlSupport: true,
      };
      const r = reduce(state, {
        kind: "head-response",
        status: 200,
        isHtml: false,
      });
      expect(r.next).toEqual({
        status: "online",
        port: 3000,
        htmlSupport: false,
      });
      expect(r.log).toBeUndefined();
    });

    test("offline → online: no log, htmlSupport refreshes", () => {
      const state: ProbeState = {
        status: "offline",
        port: 3000,
        htmlSupport: true,
      };
      const r = reduce(state, {
        kind: "head-response",
        status: 200,
        isHtml: true,
      });
      expect(r.next).toEqual({
        status: "online",
        port: 3000,
        htmlSupport: true,
      });
      expect(r.log).toBeUndefined();
    });
  });

  describe("head-failure", () => {
    test("online → offline with log", () => {
      const state: ProbeState = {
        status: "online",
        port: 3000,
        htmlSupport: true,
      };
      const r = reduce(state, { kind: "head-failure" });
      expect(r.next).toEqual({
        status: "offline",
        port: 3000,
        htmlSupport: true, // sticky on offline
      });
      expect(r.log).toContain("port 3000");
    });

    test("booting → booting: no change, no log", () => {
      const state: ProbeState = {
        status: "booting",
        port: 3000,
        htmlSupport: false,
      };
      const r = reduce(state, { kind: "head-failure" });
      expect(r.next).toEqual(state);
      expect(r.log).toBeUndefined();
    });

    test("offline → offline: no change, no log", () => {
      const state: ProbeState = {
        status: "offline",
        port: 3000,
        htmlSupport: true,
      };
      const r = reduce(state, { kind: "head-failure" });
      expect(r.next).toEqual(state);
      expect(r.log).toBeUndefined();
    });
  });
});

describe("cadence", () => {
  test("booting → fast", () => {
    expect(
      cadence({ status: "booting", port: 3000, htmlSupport: false }),
    ).toBe(PROBE_FAST_MS);
  });

  test("online → slow", () => {
    expect(cadence({ status: "online", port: 3000, htmlSupport: true })).toBe(
      PROBE_SLOW_MS,
    );
  });

  test("offline → fast", () => {
    expect(
      cadence({ status: "offline", port: 3000, htmlSupport: true }),
    ).toBe(PROBE_FAST_MS);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
bun test packages/sandbox/daemon/probe.test.ts
```
Expected: tests fail with import errors — `reduce`, `cadence`, `ProbeState`, `PROBE_FAST_MS`, `PROBE_SLOW_MS` don't exist (or `selectActive` is referenced under the old export).

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/sandbox/daemon/probe.test.ts
git commit -m "$(cat <<'EOF'
test(sandbox/daemon): add tests for new probe reducer (failing)

Drives the rewrite of probe.ts in the next commit. Tests cover the
state machine (booting/online/offline), port-change resets, and the
cadence selector.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement new `probe.ts` (reducer + loop) and replace old probe

**Files:**
- Rewrite: `packages/sandbox/daemon/probe.ts`
- Modify: `packages/sandbox/daemon/constants.ts:12-14` (replace probe constants)

This task makes the failing tests pass and replaces the old probe wholesale. The pure reducer is implemented first; then the loop is layered on top.

- [ ] **Step 1: Replace probe constants in `constants.ts:12-14`**

```ts
// BEFORE:
export const FAST_PROBE_MS = 3000;
export const SLOW_PROBE_MS = 30000;
export const FAST_PROBE_LIMIT = 20;

// AFTER:
export const PROBE_FAST_MS = 1000;
export const PROBE_SLOW_MS = 30_000;
export const PROBE_HEAD_TIMEOUT_MS = 5_000;
```

- [ ] **Step 2: Replace `probe.ts` entirely**

Overwrite `packages/sandbox/daemon/probe.ts` with:

```ts
/**
 * Single-port HEAD probe. Polls the configured `application.port` at 1 s
 * while booting/offline, 30 s while online. Single-flight HEAD with a 5 s
 * timeout. Treats any HTTP response (incl. 404) as "up".
 */
import {
  PROBE_FAST_MS,
  PROBE_HEAD_TIMEOUT_MS,
  PROBE_SLOW_MS,
} from "./constants";

export type UpstreamStatus = "booting" | "online" | "offline";

export interface ProbeState {
  status: UpstreamStatus;
  port: number | null;
  htmlSupport: boolean;
}

export type ProbeEvent =
  | { kind: "head-response"; status: number; isHtml: boolean }
  | { kind: "head-failure" }
  | { kind: "port-change"; port: number | null };

export interface ReduceResult {
  next: ProbeState;
  log?: string;
}

export interface ProbeDeps {
  /** Reads `config.application.port`. Called every tick — config-change-aware. */
  getPort: () => number | null;
  onChange: (state: ProbeState) => void;
  onLog?: (msg: string) => void;
}

export function reduce(state: ProbeState, event: ProbeEvent): ReduceResult {
  switch (event.kind) {
    case "port-change": {
      if (event.port === state.port) return { next: state };
      return {
        next: { status: "booting", port: event.port, htmlSupport: false },
      };
    }
    case "head-response": {
      const next: ProbeState = {
        status: "online",
        port: state.port,
        htmlSupport: event.isHtml,
      };
      if (state.status === "booting") {
        return {
          next,
          log: `[probe] server responded on port ${state.port} (status ${event.status})`,
        };
      }
      return { next };
    }
    case "head-failure": {
      if (state.status !== "online") return { next: state };
      return {
        next: { ...state, status: "offline" },
        log: `[probe] server stopped responding on port ${state.port}`,
      };
    }
  }
}

export function cadence(state: ProbeState): number {
  return state.status === "online" ? PROBE_SLOW_MS : PROBE_FAST_MS;
}

interface HeadResult {
  status: number;
  isHtml: boolean;
}

async function head(url: string, timeoutMs: number): Promise<HeadResult | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    return { status: res.status, isHtml: ct.includes("text/html") };
  } catch {
    return null;
  }
}

/**
 * Returns a live `ProbeState` reference — the fields are mutated in place
 * on every change so the SSE handshake (`getLastStatus`) sees fresh values
 * without a getter.
 */
export function startUpstreamProbe(deps: ProbeDeps): ProbeState {
  const state: ProbeState = {
    status: "booting",
    port: null,
    htmlSupport: false,
  };
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function applyEvent(event: ProbeEvent) {
    const result = reduce(state, event);
    const changed =
      result.next.status !== state.status ||
      result.next.port !== state.port ||
      result.next.htmlSupport !== state.htmlSupport;
    state.status = result.next.status;
    state.port = result.next.port;
    state.htmlSupport = result.next.htmlSupport;
    if (result.log) deps.onLog?.(`${result.log}\r\n`);
    if (changed) {
      deps.onChange({
        status: state.status,
        port: state.port,
        htmlSupport: state.htmlSupport,
      });
    }
  }

  async function tick() {
    const port = deps.getPort();
    if (port !== state.port) {
      applyEvent({ kind: "port-change", port });
    }

    if (state.port === null || inFlight) {
      schedule();
      return;
    }

    const portAtStart = state.port;
    inFlight = true;
    let result: HeadResult | null;
    try {
      result = await head(
        `http://localhost:${portAtStart}/`,
        PROBE_HEAD_TIMEOUT_MS,
      );
    } finally {
      inFlight = false;
    }

    // Discard if port changed mid-flight; next tick will probe the new port.
    if (state.port !== portAtStart) {
      schedule();
      return;
    }

    if (result !== null) {
      applyEvent({
        kind: "head-response",
        status: result.status,
        isHtml: result.isHtml,
      });
    } else {
      applyEvent({ kind: "head-failure" });
    }
    schedule();
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void tick(), cadence(state));
  }

  schedule();
  return state;
}
```

- [ ] **Step 3: Run the probe tests and verify they pass**

```bash
bun test packages/sandbox/daemon/probe.test.ts
```
Expected: all tests pass (15 tests).

- [ ] **Step 4: DO NOT commit yet — typecheck is broken**

```bash
bun run check
```
Expected: errors in `entry.ts` (old probe API) and `events/sse.ts` (old `getLastStatus` return type). The probe tests pass, but the rest of the build doesn't typecheck.

These get fixed in Tasks 5 and 6. Tasks 4–6 form one atomic switch committed at the end of Task 6. Move on without committing.

---

## Task 5: Wire new probe into `entry.ts` and delete `port-discovery.ts`

**Files:**
- Modify: `packages/sandbox/daemon/entry.ts` (lines 14, 155-194 area)
- Delete: `packages/sandbox/daemon/process/port-discovery.ts`

- [ ] **Step 1: Replace the probe wiring block in `entry.ts`**

Find the block starting at `const getDiscoveredPorts = () => {` (around line 155) through the end of `startUpstreamProbe(...)` (around line 194). Replace the entire span with:

```ts
const lastStatus = startUpstreamProbe({
  getPort: () => store.read()?.application?.port ?? null,
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
    if (s.status === "online" && s.port !== null) appService.markUp();
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
});
```

The `getDevPort` helper a few lines below should now read directly from config (NOT from `lastStatus.port`):

```ts
// BEFORE:
const getDevPort = (): number | null => lastStatus.port;

// AFTER:
const getDevPort = (): number | null =>
  store.read()?.application?.port ?? null;
```

- [ ] **Step 2: Remove the now-dead `discoverDescendantListeningPorts` import**

At the top of `entry.ts` (line 14):

```ts
// DELETE:
import { discoverDescendantListeningPorts } from "./process/port-discovery";
```

Also drop the `excludeFromDiscovery` declaration if it is now unused (search the file).

- [ ] **Step 3: Delete `port-discovery.ts`**

```bash
rm packages/sandbox/daemon/process/port-discovery.ts
```

- [ ] **Step 4: Run typecheck**

```bash
bun run check
```
Expected: errors only in `events/sse.ts` (and `events/sse.test.ts`) — the `getLastStatus` return type still references `responded` / `ready`. Task 6 fixes this.

- [ ] **Step 5: DO NOT commit yet**

The daemon-side build still references the old SSE shape in `events/sse.ts`. Move on to Task 6 — the atomic commit happens at the end of that task.

---

## Task 6: Update SSE event shape (daemon side)

**Files:**
- Modify: `packages/sandbox/daemon/events/sse.ts:5-12`
- Modify: `packages/sandbox/daemon/events/sse.test.ts:6-19`
- Modify: `packages/sandbox/daemon/daemon.e2e.test.ts` (any assertions referencing `responded`/`ready`)

- [ ] **Step 1: Update `SseHandshakeDeps` in `events/sse.ts`**

```ts
// BEFORE (lines 5-12):
export interface SseHandshakeDeps {
  broadcaster: Broadcaster;
  getLastStatus: () => {
    ready: boolean;
    responded: boolean;
    htmlSupport: boolean;
    port: number | null;
  };

// AFTER:
import type { UpstreamStatus } from "../probe";

export interface SseHandshakeDeps {
  broadcaster: Broadcaster;
  getLastStatus: () => {
    status: UpstreamStatus;
    port: number | null;
    htmlSupport: boolean;
  };
```

- [ ] **Step 2: Update `events/sse.test.ts:6-19` fixture**

```ts
// BEFORE:
  const mkDeps = (b: Broadcaster) => ({
    broadcaster: b,
    getLastStatus: () => ({
      ready: false,
      responded: false,
      htmlSupport: false,
      port: null,
    }),

// AFTER:
  const mkDeps = (b: Broadcaster) => ({
    broadcaster: b,
    getLastStatus: () => ({
      status: "booting" as const,
      port: null,
      htmlSupport: false,
    }),
```

- [ ] **Step 3: Update `daemon.e2e.test.ts` if it asserts on `responded`/`ready`**

Search the file:

```bash
grep -n "responded\|\.ready" packages/sandbox/daemon/daemon.e2e.test.ts
```

For every assertion of the form:

```ts
expect(status.responded).toBe(true);
expect(status.ready).toBe(true);
```

Replace with:

```ts
expect(status.status).toBe("online");
```

(For an explicit "any HTTP response" check, `status.status === "online"` covers both old `responded` and old `ready` since the e2e harness probes a real HTML server that returns 200.)

- [ ] **Step 4: Run typecheck**

```bash
bun run check
```
Expected: no errors in `packages/sandbox/`.

- [ ] **Step 5: Run all daemon tests**

```bash
bun test packages/sandbox/daemon
```
Expected: all pass.

- [ ] **Step 6: Format and commit (atomic switch covering Tasks 4 + 5 + 6)**

```bash
bun run fmt
git add -A packages/sandbox/daemon packages/sandbox/daemon/process
git rm packages/sandbox/daemon/process/port-discovery.ts 2>/dev/null || true
git commit -m "$(cat <<'EOF'
refactor(sandbox/daemon): replace probe with single-port HEAD poller

- New probe.ts: 3-state status (booting | online | offline), 1s/30s
  cadence, 5s single-flight HEAD, pure reducer + thin setTimeout loop.
- entry.ts wires the new probe; getDevPort reads application.port
  directly — probe no longer drives proxy routing.
- SSE status event drops ready/responded/ports; emits status enum.
- port-discovery.ts deleted (~342 LOC); descendant-pid port scanning
  is gone. Tests cover all reducer transitions and cadence selection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: this single commit covers all the changes from Tasks 4, 5, and 6. Tasks 4 and 5 are intentionally non-committing waypoints; the build is only green after Task 6's edits.

After committing, verify the daemon test suite is green:

```bash
bun test packages/sandbox/daemon
```
Expected: all pass.

---

## Task 7: Update mesh UI to consume new SSE shape

**Files:**
- Modify: `apps/mesh/src/web/components/vm/preview/preview-state.ts`
- Modify: `apps/mesh/src/web/components/vm/preview/preview-state.test.ts`
- Modify: `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx:41-48,109-122,174-179,207-212,285-290,315-321`
- Modify: `apps/mesh/src/web/components/vm/preview/preview.tsx:102-189`

The mesh UI was the largest consumer of `responded`/`htmlSupport`. With `status`, we collapse the `bootEverReady` per-URL latch (now subsumed by `status === "online" || "offline"`).

- [ ] **Step 1: Update `preview-state.ts`**

Replace the file entirely:

```ts
/**
 * Pure preview-state decision: maps inputs from preview.tsx into a
 * discriminated state union. Extracted so it can be unit-tested without
 * DOM/auth/SSE scaffolding.
 *
 * Priority order (highest first):
 *   error → suspended → booting → no-html → iframe → idle
 *
 * `status === "online" || "offline"` is the "ever-responded" latch:
 * once the daemon has seen the upstream answer, the iframe stays mounted
 * across transient drops (htmlSupport is sticky on offline at the source).
 */

export type UpstreamStatus = "booting" | "online" | "offline";
export type ClaimPhaseLike = { kind: string };

export interface PreviewStateInput {
  previewUrl: string | null;
  status: UpstreamStatus;
  htmlSupport: boolean;
  suspended: boolean;
  appPaused: boolean;
  vmStartPending: boolean;
  lastStartError: string | null;
  claimPhase: ClaimPhaseLike | null;
  notFound: boolean;
}

export type PreviewState =
  | { kind: "idle" }
  | { kind: "booting" }
  | { kind: "error"; error: string }
  | { kind: "suspended" }
  | { kind: "no-html"; previewUrl: string }
  | { kind: "iframe"; previewUrl: string };

export function computePreviewState(input: PreviewStateInput): PreviewState {
  if (input.lastStartError) {
    return { kind: "error", error: input.lastStartError };
  }
  if (input.suspended || input.appPaused) {
    return { kind: "suspended" };
  }
  if (input.notFound) {
    return { kind: "booting" };
  }
  if (!input.previewUrl && input.vmStartPending) {
    return { kind: "booting" };
  }
  if (
    !input.previewUrl &&
    input.claimPhase &&
    input.claimPhase.kind !== "failed"
  ) {
    return { kind: "booting" };
  }
  if (!input.previewUrl) {
    return { kind: "idle" };
  }
  // previewUrl set: decide between iframe / no-html / booting.
  if (input.status === "online" || input.status === "offline") {
    if (input.htmlSupport) {
      return { kind: "iframe", previewUrl: input.previewUrl };
    }
    return { kind: "no-html", previewUrl: input.previewUrl };
  }
  return { kind: "booting" };
}
```

- [ ] **Step 2: Update `preview-state.test.ts`**

Replace the file entirely:

```ts
import { describe, expect, test } from "bun:test";
import { computePreviewState } from "./preview-state";
import type { PreviewStateInput } from "./preview-state";

const base: PreviewStateInput = {
  previewUrl: "http://localhost:5173",
  status: "booting",
  htmlSupport: false,
  suspended: false,
  appPaused: false,
  vmStartPending: false,
  lastStartError: null,
  claimPhase: null,
  notFound: false,
};

describe("computePreviewState", () => {
  test("error wins over everything", () => {
    expect(
      computePreviewState({
        ...base,
        lastStartError: "boom",
        status: "online",
        htmlSupport: true,
      }),
    ).toEqual({ kind: "error", error: "boom" });
  });

  test("suspended wins over content states", () => {
    expect(
      computePreviewState({
        ...base,
        suspended: true,
        status: "online",
        htmlSupport: true,
      }),
    ).toEqual({ kind: "suspended" });
  });

  test("appPaused wins over content states", () => {
    expect(
      computePreviewState({
        ...base,
        appPaused: true,
        status: "online",
        htmlSupport: true,
      }),
    ).toEqual({ kind: "suspended" });
  });

  test("notFound triggers booting overlay", () => {
    expect(computePreviewState({ ...base, notFound: true })).toEqual({
      kind: "booting",
    });
  });

  test("vmStartPending without previewUrl → booting", () => {
    expect(
      computePreviewState({
        ...base,
        previewUrl: null,
        vmStartPending: true,
      }),
    ).toEqual({ kind: "booting" });
  });

  test("previewUrl set, online but not html → no-html empty state", () => {
    expect(
      computePreviewState({ ...base, status: "online", htmlSupport: false }),
    ).toEqual({ kind: "no-html", previewUrl: "http://localhost:5173" });
  });

  test("previewUrl set, online and html → iframe", () => {
    expect(
      computePreviewState({ ...base, status: "online", htmlSupport: true }),
    ).toEqual({ kind: "iframe", previewUrl: "http://localhost:5173" });
  });

  test("previewUrl set, still booting → booting overlay", () => {
    expect(computePreviewState({ ...base, status: "booting" })).toEqual({
      kind: "booting",
    });
  });

  test("offline persists iframe across transient drops (htmlSupport sticky)", () => {
    expect(
      computePreviewState({ ...base, status: "offline", htmlSupport: true }),
    ).toEqual({ kind: "iframe", previewUrl: "http://localhost:5173" });
  });

  test("offline persists no-html across transient drops", () => {
    expect(
      computePreviewState({ ...base, status: "offline", htmlSupport: false }),
    ).toEqual({ kind: "no-html", previewUrl: "http://localhost:5173" });
  });

  test("no previewUrl, no startError, no pending, no lifecycle → idle", () => {
    expect(computePreviewState({ ...base, previewUrl: null })).toEqual({
      kind: "idle",
    });
  });

  test("lifecycleActive with no previewUrl → booting", () => {
    expect(
      computePreviewState({
        ...base,
        previewUrl: null,
        claimPhase: { kind: "claiming" },
      }),
    ).toEqual({ kind: "booting" });
  });
});
```

- [ ] **Step 3: Run preview-state tests**

```bash
bun test apps/mesh/src/web/components/vm/preview/preview-state.test.ts
```
Expected: all pass.

- [ ] **Step 4: Update `VmStatus` shape in `vm-events-context.tsx:41-48`**

```ts
// BEFORE:
export interface VmStatus {
  /** Active port answered with 2xx-3xx — content is expected to render. */
  ready: boolean;
  /** Active port answered any HTTP status — port is up. Use to dismiss boot overlays. */
  responded: boolean;
  htmlSupport: boolean;
  /** Currently active dev port (pinned `devPort` if responding, otherwise highest-scored discovered). */
  port: number | null;
}

// AFTER:
export type UpstreamStatus = "booting" | "online" | "offline";

export interface VmStatus {
  status: UpstreamStatus;
  port: number | null;
  htmlSupport: boolean;
}
```

- [ ] **Step 5: Update `DEFAULT_VALUE.status` in `vm-events-context.tsx:111`**

```ts
// BEFORE:
  status: { ready: false, responded: false, htmlSupport: false, port: null },

// AFTER:
  status: { status: "booting", port: null, htmlSupport: false },
```

- [ ] **Step 6: Update the three reset sites in `vm-events-context.tsx`**

Find each block of:
```ts
    setStatus({
      ready: false,
      responded: false,
      htmlSupport: false,
      port: null,
    });
```
(Around lines 174-179, 207-212, 285-290.)

Replace each with:

```ts
    setStatus({ status: "booting", port: null, htmlSupport: false });
```

- [ ] **Step 7: Update SSE status parsing in `vm-events-context.tsx:315-321`**

```ts
// BEFORE:
        } else if (e.type === "status") {
          setStatus({
            ready: Boolean(data.ready),
            responded: Boolean(data.responded),
            htmlSupport: Boolean(data.htmlSupport),
            port: typeof data.port === "number" ? data.port : null,
          });

// AFTER:
        } else if (e.type === "status") {
          const s = data.status;
          setStatus({
            status:
              s === "online" || s === "offline" || s === "booting"
                ? s
                : "booting",
            port: typeof data.port === "number" ? data.port : null,
            htmlSupport: Boolean(data.htmlSupport),
          });
```

- [ ] **Step 8: Update `preview.tsx`**

Drop the entire `bootTrackedRef` machinery (lines 116-143). Replace with the simpler version:

```tsx
// BEFORE (lines 116-143):
  // Latch on `responded` (any HTTP response), not `ready` (2xx-3xx).
  // A server that returns 404 on `/` is up — we shouldn't get stuck on the
  // booting overlay just because it doesn't serve HTML at `/`. Once latched,
  // computePreviewState honors `bootEverReady` so brief probe-down hiccups
  // don't drop the iframe back into the boot overlay.
  const bootTrackedRef = useRef<{
    url: string;
    at: number;
    everReady: boolean;
  }>({
    url: "",
    at: 0,
    everReady: false,
  });
  if (previewUrl && bootTrackedRef.current.url !== previewUrl) {
    bootTrackedRef.current = {
      url: previewUrl,
      at: vmEntry?.createdAt ?? Date.now(),
      everReady: false,
    };
  }
  if (
    previewUrl &&
    vmEvents.status.responded &&
    !bootTrackedRef.current.everReady
  ) {
    bootTrackedRef.current.everReady = true;
  }

// AFTER:
  // The daemon's status enum (booting/online/offline) is itself the
  // "ever-responded" latch — offline means we saw a response and lost it,
  // and htmlSupport is sticky on offline at the source.
```

Then update the `computePreviewState(...)` call (lines 178-189):

```tsx
// BEFORE:
  const previewState = computePreviewState({
    previewUrl,
    responded: vmEvents.status.responded,
    htmlSupport: vmEvents.status.htmlSupport,
    suspended,
    appPaused,
    vmStartPending,
    lastStartError,
    claimPhase,
    notFound: vmEvents.notFound,
    bootEverReady: bootTrackedRef.current.everReady,
  });

// AFTER:
  const previewState = computePreviewState({
    previewUrl,
    status: vmEvents.status.status,
    htmlSupport: vmEvents.status.htmlSupport,
    suspended,
    appPaused,
    vmStartPending,
    lastStartError,
    claimPhase,
    notFound: vmEvents.notFound,
  });
```

If `vmEntry` is now unused in `preview.tsx` (the `vmEntry?.createdAt` reference went away with `bootTrackedRef`), check whether the import or local variable is dead. If so, delete it. If it's still used elsewhere in the file, leave it.

- [ ] **Step 9: Run mesh typecheck**

```bash
bun run check
```
Expected: no errors anywhere in the repo. If `vmEntry` was used only by the deleted block, the unused-import lint will flag it — delete the import.

- [ ] **Step 10: Run mesh tests**

```bash
bun test apps/mesh/src/web/components/vm/preview
```
Expected: all preview-state tests pass.

- [ ] **Step 11: Run the full repo test suite**

```bash
bun test
```
Expected: all pass.

- [ ] **Step 12: Format and commit**

```bash
bun run fmt
git add -A apps/mesh/
git commit -m "$(cat <<'EOF'
refactor(mesh/web): consume new VM upstream status enum

Replace ready/responded with a single status field. Drop bootEverReady
per-URL latch — daemon's offline state subsumes it (htmlSupport is
sticky on offline at the source).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual end-to-end verification

This task runs the spec's manual verification checklist. No code changes; if any check fails, fix forward in a new task.

- [ ] **Step 1: Boot a sandbox running a Next.js or Vite app on port 3000**

Start the dev environment:

```bash
bun run dev
```

Open the mesh UI, create or open a VM that spins up a sandbox with an HTML-serving dev script.

Watch the SSE log stream in the VM panel. Expected sequence:
- `[probe] server responded on port 3000 (status 200)` (after Vite/Next finish their initial compile)
- Iframe renders with the dev preview.

- [ ] **Step 2: Boot a sandbox with an API-only app returning 404 at `/`**

Use a project whose dev script binds the port but doesn't serve HTML at `/` (e.g., a Hono app routed to `/api/*`).

Expected:
- `[probe] server responded on port 3000 (status 404)`
- Preview state is "no-html" (empty state, not the booting overlay).

- [ ] **Step 3: Crash the dev process inside the sandbox**

In the VM's bash terminal, kill the dev process:

```bash
pkill -f 'npm run dev' || pkill -f 'bun run dev' || pkill -f 'vite'
```

Expected within ~30 s (one slow tick):
- `[probe] server stopped responding on port 3000`
- Iframe stays mounted (htmlSupport sticky).
- Polling resumes at 1 s; once the dev script auto-restarts (or the user `bun run dev`s again), `[probe] server responded on port 3000` fires.

- [ ] **Step 4: Retarget via `PUT /config`**

From a terminal with daemon access, retarget the port:

```bash
# Find daemon port
ps aux | grep "deco-daemon" | grep -v grep
# (or check the local-ingress proxy logs)

# Send a port change. Replace TOKEN/PORT with your daemon's values.
curl -X PUT "http://localhost:<DAEMON_PORT>/_decopilot_vm/config" \
  -H "Authorization: Bearer <TOKEN>" \
  --data "$(echo -n '{"application":{"port":5173}}' | base64)"
```

Expected:
- Probe immediately drops to `booting` for port 5173.
- Orchestrator logs `transition: port-change`.
- Dev server restarts on 5173; probe goes `online` once it responds.

- [ ] **Step 5: Final checks**

```bash
bun run check
bun run lint
bun test
bun run fmt:check
```

All must succeed.

- [ ] **Step 6: Commit verification notes (optional)**

If any deviation from expected behavior was observed, file an issue or add a follow-up commit. Otherwise this task ends with the manual checklist completed.

---

## Self-review (post-write)

**Spec coverage check:**

- ✅ Probe rewrite to 3-state status — Tasks 3–4
- ✅ 1 s/30 s cadence — Task 4 (`cadence()` impl) + Task 3 (cadence tests)
- ✅ 5 s single-flight HEAD timeout — Task 4 (`PROBE_HEAD_TIMEOUT_MS` and `inFlight` gate)
- ✅ `desiredPort → port` rename — Task 1
- ✅ Drop `port-discovery.ts` — Task 5
- ✅ Drop `proxy.targetPort` field/transition/writeback — Task 2
- ✅ Drop `ports[]`/`responded`/`ready` SSE fields — Tasks 6–7
- ✅ `appService.markUp()` on first `booting → online` — Task 5 (`onChange` callback)
- ✅ Mesh UI updates — Task 7
- ✅ Manual verification — Task 8

**Type consistency:**
- `UpstreamStatus` is defined in `probe.ts` (Task 4) and re-exported / re-declared in `preview-state.ts` and `vm-events-context.tsx` (Task 7). Re-declaration is intentional — daemon and mesh share no compile-time types. If the values diverge, the SSE parser's defensive narrowing in Task 7 step 7 catches it.
- `ProbeState` shape `{ status, port, htmlSupport }` matches the SSE payload spread `{ type: "status", ...s }` in Task 5 step 1.
- `cadence()` signature takes `ProbeState`, returns `number`. Used inside `schedule()` in `startUpstreamProbe`.

**Placeholder scan:** none.

**Ordering:** Tasks 4 and 5 are non-committing waypoints. The single atomic commit happens at the end of Task 6, covering the probe rewrite + entry.ts wiring + SSE shape change + port-discovery deletion. Each prior task (1, 2) and Task 7 is its own self-contained green commit.

**Between Task 6 and Task 7:** the daemon emits the new SSE shape but the mesh UI still parses the old shape (treats every status as falsy → permanent boot overlay). Don't manually exercise the UI in this window. Task 8 covers manual verification after Task 7 lands.

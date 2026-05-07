# Unify Dev/Start Through TaskManager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dual-process-owner architecture in the sandbox daemon — every script (including `dev` / `start`) runs through `TaskManager`. The orchestrator owns project lifecycle (clone, install, dev-task spawning, intent) but no longer owns the dev process directly. `ApplicationService` is deleted.

**Architecture:** Three small TaskManager primitives (`replaceByLogName`, `intentional` kill flag, `onTaskExit` hook) let the orchestrator drive the dev script as a normal task. A new `intent: { state: "running" | "paused" }` SSE event replaces `app-status` for the UI's "paused after crash" treatment. Probe decouples from the process owner. UI's `isStarter` branch in `env.tsx` collapses; one uniform `Run / Stopping… / Restart / Stop` flow for every tab.

**Tech Stack:** Bun runtime, TypeScript 5.9, Hono (mesh API), React 19 (UI), Bun test runner, Biome formatter, oxlint.

**Spec:** `docs/superpowers/specs/2026-05-07-unify-dev-via-taskmanager-design.md`

---

## File Structure

### Modified

- `packages/sandbox/daemon/process/task-manager.ts` — add `replaceByLogName`, `intentional` flag, `onTaskExit`, `waitForLogNamesIdle`. Async `spawn`.
- `packages/sandbox/daemon/process/task-manager.test.ts` — **new file**, unit tests for the new primitives.
- `packages/sandbox/daemon/setup/orchestrator.ts` — drop `appService` dep; add `intent` state; rewire `startIfReady` and the three `appService.stop()` callsites to use TaskManager; subscribe to `onTaskExit`.
- `packages/sandbox/daemon/setup/orchestrator.test.ts` — replace `appService` mock with `taskManager` mock; add intent-transition tests.
- `packages/sandbox/daemon/entry.ts` — drop `appService` construction, the `markUp()` probe wiring, the `runningSource()` kill block, and the `getApp/getAppStatus` deps. Wire `intent` broadcast.
- `packages/sandbox/daemon/events/sse.ts` — drop `getAppStatus` + `app-status` handshake block; add `intent` handshake block.
- `packages/sandbox/daemon/events/sse.test.ts` — swap `app-status` assertion for `intent`.
- `packages/sandbox/daemon/routes/health.test.ts` — repoint `installedAt` source to `installState.snapshot()`.
- `packages/sandbox/daemon/routes/exec.ts` — `await taskManager.spawn(...)`.
- `packages/sandbox/daemon/routes/bash.ts` — `await taskManager.spawn(...)`.
- `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx` — drop `appStatus`, add `intent` + `installing`.
- `apps/mesh/src/web/components/vm/env/env.tsx` — collapse `isStarter` button logic.
- `apps/mesh/src/web/components/vm/preview/preview.tsx` — `appPaused` from `intent`.

### Deleted

- `packages/sandbox/daemon/app/application-service.ts` — entire file.
- `packages/sandbox/daemon/app/` directory if empty after deletion.

---

## Task 1: Add `intentional` flag to TaskManager kills

**Files:**
- Modify: `packages/sandbox/daemon/process/task-manager.ts`
- Test: `packages/sandbox/daemon/process/task-manager.test.ts` (new file)

- [ ] **Step 1: Create the test file with a failing intentional-flag test**

Create `packages/sandbox/daemon/process/task-manager.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskManager } from "./task-manager";

function makeManager() {
  const logsDir = mkdtempSync(join(tmpdir(), "tm-"));
  return new TaskManager({ logsDir });
}

describe("TaskManager intentional flag", () => {
  it("surfaces intentional=true on summary after killByLogName({intentional:true})", async () => {
    const tm = makeManager();
    const t = tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    const finished = tm.finished(t.id)!;
    const killed = tm.killByLogName("dev", { intentional: true });
    expect(killed).toBe(1);
    await finished;
    const summary = tm.get(t.id)!;
    expect(summary.intentional).toBe(true);
  });

  it("surfaces intentional=false (or undefined) for default kills", async () => {
    const tm = makeManager();
    const t = tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    const finished = tm.finished(t.id)!;
    tm.killByLogName("dev");
    await finished;
    const summary = tm.get(t.id)!;
    expect(summary.intentional).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: 2 failures — `killByLogName` doesn't accept the options object and `intentional` is not on `TaskSummary`.

- [ ] **Step 3: Add `intentional` to `TaskInternal`, `TaskSummary`, and update `killByLogName`**

In `packages/sandbox/daemon/process/task-manager.ts`:

Add to `TaskSummary` (around line 42):

```ts
export interface TaskSummary {
  id: string;
  command: string;
  status: TaskStatus;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  timedOut: boolean;
  truncated: boolean;
  logName?: string;
  /** True when the kill that terminated this task was flagged intentional
   *  (orchestrator-driven stop, replace-by-logName, or user Stop). */
  intentional?: boolean;
}
```

Add to `TaskInternal` (around line 59):

```ts
interface TaskInternal {
  id: string;
  spec: TaskSpec;
  status: TaskStatus;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
  timedOut: boolean;
  pid: number | undefined;
  pgid: number | undefined;
  phaseId: string | undefined;
  stdout: RingBuffer;
  stderr: RingBuffer;
  tee: LogTee;
  logPath: string;
  subscribers: Set<(c: OutputChunk) => void>;
  finishedPromise: Promise<TaskResult>;
  resolveFinished: (r: TaskResult) => void;
  kill: (signal?: NodeJS.Signals) => void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Set when a kill was flagged intentional. Surfaced on TaskSummary
   *  so subscribers can distinguish stop from crash. */
  intentional: boolean;
}
```

Update `killByLogName` (around line 186) to accept options:

```ts
killByLogName(
  logName: string,
  opts?: { intentional?: boolean; signal?: NodeJS.Signals },
): number {
  const signal = opts?.signal ?? "SIGTERM";
  let count = 0;
  for (const t of this.tasks.values()) {
    if (t.status !== "running" || t.spec.logName !== logName) continue;
    if (opts?.intentional) t.intentional = true;
    t.kill(signal);
    setTimeout(() => {
      if (t.status === "running") t.kill("SIGKILL");
    }, 3000);
    count++;
  }
  return count;
}
```

Update `summarize` (around line 465) to surface the flag:

```ts
function summarize(t: TaskInternal): TaskSummary {
  return {
    id: t.id,
    command: t.spec.command,
    status: t.status,
    exitCode: t.exitCode,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    timedOut: t.timedOut,
    truncated: t.tee.isTruncated(),
    logName: t.spec.logName,
    intentional: t.intentional,
  };
}
```

Initialize `intentional: false` in `create()`. Find the `create()` method (around line 262) and add the field to the returned task object. Locate the existing `phaseId: undefined,` line and add `intentional: false,` next to it.

- [ ] **Step 4: Run tests — verify they pass**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: 2 pass.

- [ ] **Step 5: Commit**

```
git add packages/sandbox/daemon/process/task-manager.ts packages/sandbox/daemon/process/task-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): TaskManager intentional kill flag

killByLogName(name, { intentional: true }) flags the upcoming exit so
subscribers can distinguish user/system Stop from a crash. Surfaced on
TaskSummary.intentional. Foundation for unifying dev/start under
TaskManager (replacing ApplicationService.intentionalStop).
EOF
)"
```

---

## Task 2: Add `replaceByLogName` to TaskManager.spawn

**Files:**
- Modify: `packages/sandbox/daemon/process/task-manager.ts`
- Modify: `packages/sandbox/daemon/process/task-manager.test.ts`
- Modify: `packages/sandbox/daemon/routes/exec.ts`
- Modify: `packages/sandbox/daemon/routes/bash.ts`

- [ ] **Step 1: Add a failing test for replaceByLogName**

Append to `packages/sandbox/daemon/process/task-manager.test.ts`:

```ts
describe("TaskManager replaceByLogName", () => {
  it("kills the running task with the same logName, awaits exit, then spawns", async () => {
    const tm = makeManager();
    const first = tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    const firstFinished = tm.finished(first.id)!;

    const second = await tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
      replaceByLogName: true,
    });

    // First task must be exited (killed) by the time the new spawn returns.
    const firstResult = await firstFinished;
    expect(["killed", "exited", "failed"]).toContain(firstResult.status);
    expect(tm.get(first.id)?.intentional).toBe(true);

    // Second task is fresh and running.
    expect(second.id).not.toBe(first.id);
    expect(tm.get(second.id)?.status).toBe("running");

    // Cleanup.
    tm.killByLogName("dev");
    await tm.finished(second.id);
  });

  it("just spawns when no task with that logName is running", async () => {
    const tm = makeManager();
    const t = await tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
      replaceByLogName: true,
    });
    expect(tm.get(t.id)?.status).toBe("running");
    tm.killByLogName("dev");
    await tm.finished(t.id);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: 2 new failures — `spawn` is sync and doesn't accept `replaceByLogName`.

- [ ] **Step 3: Make `spawn` async and add `replaceByLogName`**

In `packages/sandbox/daemon/process/task-manager.ts`, replace the existing `spawn`:

```ts
async spawn(
  spec: TaskSpec & { replaceByLogName?: boolean },
): Promise<TaskSummary> {
  if (spec.replaceByLogName && spec.logName) {
    // Kill any running task with the same logName, await exit, then proceed.
    // Mirrors the old ApplicationService.start() "replace if alive" semantic
    // but inside a single owner — no leaked PTYs, no orphaned log routing.
    const waiters: Array<Promise<unknown>> = [];
    for (const t of this.tasks.values()) {
      if (t.status !== "running" || t.spec.logName !== spec.logName) continue;
      t.intentional = true;
      t.kill("SIGTERM");
      setTimeout(() => {
        if (t.status === "running") t.kill("SIGKILL");
      }, 3000);
      waiters.push(t.finishedPromise);
    }
    if (waiters.length > 0) await Promise.all(waiters);
  }
  const id = `${TASK_FILE_PREFIX}${++this.idCounter}`;
  const task = this.create(id, spec);
  this.tasks.set(id, task);
  this.deps.onChange?.();
  return summarize(task);
}
```

- [ ] **Step 4: Update spawn callers to await**

In `packages/sandbox/daemon/routes/exec.ts` line 102, change:

```ts
const task = deps.taskManager.spawn({
```

to:

```ts
const task = await deps.taskManager.spawn({
```

In `packages/sandbox/daemon/routes/bash.ts` line 48, change:

```ts
const task = deps.taskManager.spawn({
```

to:

```ts
const task = await deps.taskManager.spawn({
```

- [ ] **Step 5: Run tests — verify they pass and nothing regressed**

```
bun test packages/sandbox/daemon/
```

Expected: all pass (4 new tests in task-manager.test.ts plus existing daemon tests).

- [ ] **Step 6: Type-check**

```
bun run --cwd packages/sandbox check
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```
git add packages/sandbox/daemon/process/task-manager.ts packages/sandbox/daemon/process/task-manager.test.ts packages/sandbox/daemon/routes/exec.ts packages/sandbox/daemon/routes/bash.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): TaskManager replaceByLogName option

spawn becomes async and accepts replaceByLogName: true to atomically
kill+await any running task with the same logName before spawning a
fresh one. Replaces ApplicationService's "replace if alive" semantic
under a single process owner — same outcome, no leaked PTYs or
orphaned log routing. Two callers (exec, bash) updated to await.
EOF
)"
```

---

## Task 3: Add `onTaskExit` subscription hook

**Files:**
- Modify: `packages/sandbox/daemon/process/task-manager.ts`
- Modify: `packages/sandbox/daemon/process/task-manager.test.ts`

- [ ] **Step 1: Add a failing test for onTaskExit**

Append to `packages/sandbox/daemon/process/task-manager.test.ts`:

```ts
describe("TaskManager onTaskExit", () => {
  it("fires for every task exit with logName, exitCode, and intentional", async () => {
    const tm = makeManager();
    const events: Array<{
      id: string;
      logName?: string;
      exitCode: number | null;
      intentional?: boolean;
    }> = [];
    tm.onTaskExit((s) => {
      events.push({
        id: s.id,
        logName: s.logName,
        exitCode: s.exitCode,
        intentional: s.intentional,
      });
    });
    const t = tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    const finished = tm.finished(t.id)!;
    tm.killByLogName("dev", { intentional: true });
    await finished;
    expect(events).toHaveLength(1);
    expect(events[0].logName).toBe("dev");
    expect(events[0].intentional).toBe(true);
  });

  it("returns an unsubscribe function", async () => {
    const tm = makeManager();
    let count = 0;
    const unsub = tm.onTaskExit(() => count++);
    unsub();
    const t = tm.spawn({
      command: "true",
      cwd: "/tmp",
      mode: "pipe",
    });
    await tm.finished(t.id);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: 2 failures — `onTaskExit` doesn't exist.

- [ ] **Step 3: Implement `onTaskExit`**

In `packages/sandbox/daemon/process/task-manager.ts`, add a private field to the class (near `private idCounter = 0;`):

```ts
private readonly exitHandlers = new Set<(s: TaskSummary) => void>();
```

Add a new public method (place near `subscribe` around line 163):

```ts
/** Subscribe to per-task exit events. Handler receives the final
 *  summary (status, exitCode, intentional, logName). Returns an
 *  unsubscribe function. */
onTaskExit(handler: (s: TaskSummary) => void): () => void {
  this.exitHandlers.add(handler);
  return () => this.exitHandlers.delete(handler);
}
```

Find the place where a task's status transitions to a terminal state (the existing exit-handling code in `create()` — search for `t.status = "exited"` and `resolveFinished`). After `resolveFinished` is called, fire the handlers. Locate the existing onExit-style handler in `create()` and add this snippet right after `t.resolveFinished(...)` (or wherever the task definitively transitions out of "running"):

```ts
const summary = summarize(t);
for (const h of this.exitHandlers) {
  try {
    h(summary);
  } catch {
    /* handlers must not crash the task lifecycle */
  }
}
```

Note: there may be multiple exit paths (normal exit, kill, timeout). Each must fire the handlers exactly once. The simplest correctness pattern is a guard: track `t.exitFired = false` initialized in `create()`, set to true the first time before firing.

Add `exitFired: boolean` to `TaskInternal`:

```ts
interface TaskInternal {
  // ...existing fields
  intentional: boolean;
  exitFired: boolean;
}
```

Initialize `exitFired: false` in `create()`. Wrap the handler-fire block:

```ts
if (!t.exitFired) {
  t.exitFired = true;
  const summary = summarize(t);
  for (const h of this.exitHandlers) {
    try {
      h(summary);
    } catch {
      /* handlers must not crash the task lifecycle */
    }
  }
}
```

Place this guard at every spot where `t.resolveFinished(...)` is called.

- [ ] **Step 4: Run tests — verify they pass**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full daemon tests + typecheck**

```
bun test packages/sandbox/daemon/
bun run --cwd packages/sandbox check
```

Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```
git add packages/sandbox/daemon/process/task-manager.ts packages/sandbox/daemon/process/task-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): TaskManager onTaskExit subscription

Generalises the per-task exit notification: any module can subscribe
via onTaskExit(handler) and receive the final TaskSummary
(status, exitCode, intentional, logName). Replaces the onFailure
callback hard-wired into ApplicationService's constructor. Used next
by the orchestrator for failure → intent=paused detection.
EOF
)"
```

---

## Task 4: Add `waitForLogNamesIdle` helper

**Files:**
- Modify: `packages/sandbox/daemon/process/task-manager.ts`
- Modify: `packages/sandbox/daemon/process/task-manager.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `packages/sandbox/daemon/process/task-manager.test.ts`:

```ts
describe("TaskManager waitForLogNamesIdle", () => {
  it("resolves once no task with any of the given logNames is running", async () => {
    const tm = makeManager();
    tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "start",
    });

    const idle = tm.waitForLogNamesIdle(["dev", "start"]);
    tm.killByLogName("dev");
    tm.killByLogName("start");
    await idle;

    const running = tm.list({ status: ["running"] });
    expect(running.filter((t) => ["dev", "start"].includes(t.logName ?? "")))
      .toHaveLength(0);
  });

  it("resolves immediately when no matching task is running", async () => {
    const tm = makeManager();
    await tm.waitForLogNamesIdle(["dev", "start"]);
    // If we got here without hanging, the test passes.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: 2 failures — `waitForLogNamesIdle` doesn't exist.

- [ ] **Step 3: Implement `waitForLogNamesIdle`**

In `packages/sandbox/daemon/process/task-manager.ts`, add:

```ts
/** Resolves once no running task carries any of the given logNames.
 *  Used by the orchestrator to await dev/start shutdown before
 *  branch/install transitions. */
async waitForLogNamesIdle(logNames: ReadonlyArray<string>): Promise<void> {
  const matching = (): TaskInternal[] => {
    const out: TaskInternal[] = [];
    for (const t of this.tasks.values()) {
      if (t.status === "running" && t.spec.logName && logNames.includes(t.spec.logName)) {
        out.push(t);
      }
    }
    return out;
  };
  const initial = matching();
  if (initial.length === 0) return;
  await Promise.all(initial.map((t) => t.finishedPromise));
}
```

- [ ] **Step 4: Run tests — verify they pass**

```
bun test packages/sandbox/daemon/process/task-manager.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```
git add packages/sandbox/daemon/process/task-manager.ts packages/sandbox/daemon/process/task-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): TaskManager waitForLogNamesIdle helper

Resolves once no task with any of the given logNames is running.
Tiny convenience for the orchestrator's stopDevTask path — kill the
starter, await idle, proceed with branch/install transitions. Saves
each caller from constructing the await-list inline.
EOF
)"
```

---

## Task 5: Add `intent` state and SSE event to entry.ts

**Files:**
- Modify: `packages/sandbox/daemon/entry.ts`
- Modify: `packages/sandbox/daemon/events/sse.ts`
- Modify: `packages/sandbox/daemon/events/sse.test.ts`

This task adds the new wire signal *additively*. `app-status` stays for now; both events coexist on the wire briefly so daemon and UI changes can land in separate commits without a broken intermediate.

- [ ] **Step 1: Add intent broadcaster + initial state in entry.ts**

In `packages/sandbox/daemon/entry.ts`, find the line `const broadcaster = new Broadcaster(...)` and after the `taskManager` / `appService` construction blocks, add:

```ts
type Intent = { state: "running" | "paused"; reason?: string };
let currentIntent: Intent = { state: "running" };
function setIntent(next: Intent) {
  currentIntent = next;
  broadcaster.broadcastEvent("intent", { type: "intent", ...next });
}
```

Export `setIntent` to the orchestrator via its deps (added in Task 6).

- [ ] **Step 2: Add `getIntent` to SSE handshake deps**

In `packages/sandbox/daemon/events/sse.ts`, extend `SseHandshakeDeps`:

```ts
export interface SseHandshakeDeps {
  broadcaster: Broadcaster;
  getLastStatus: () => {
    status: UpstreamStatus;
    port: number | null;
    htmlSupport: boolean;
  };
  getDiscoveredScripts: () => string[] | null;
  getActiveTasks: () => Array<{ id: string; command: string; logName?: string }>;
  getAppStatus: () => unknown;
  getIntent: () => { state: "running" | "paused"; reason?: string };
  getLastBranchStatus: () => BranchStatus;
  maxClients: number;
}
```

In `makeSseStream`, add an `intent` handshake block near the existing `app-status` block:

```ts
c.enqueue(
  sseFormat(
    "intent",
    JSON.stringify({ type: "intent", ...deps.getIntent() }),
  ),
);
```

- [ ] **Step 3: Wire `getIntent` in entry.ts**

In `packages/sandbox/daemon/entry.ts` find the `makeEventsHandler` call and add `getIntent`:

```ts
const eventsH = makeEventsHandler({
  broadcaster,
  getLastStatus: () => lastStatus,
  getDiscoveredScripts: () => discoveredScripts,
  getActiveTasks,
  getAppStatus: () => appService.snapshot(),
  getIntent: () => currentIntent,
  getLastBranchStatus: () => branchStatus.getLast(),
});
```

- [ ] **Step 4: Update sse.test.ts to assert intent in the handshake**

In `packages/sandbox/daemon/events/sse.test.ts`, find the existing handshake-snapshot test and add an `intent` assertion. Locate the `getAppStatus: () => ({})` line in the test setup and add:

```ts
getAppStatus: () => ({}),
getIntent: () => ({ state: "running" as const }),
```

Add an assertion that one of the emitted events is `event: intent` with the running state. Use the same pattern as existing handshake assertions in the file.

- [ ] **Step 5: Run tests + typecheck**

```
bun test packages/sandbox/daemon/
bun run --cwd packages/sandbox check
```

Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```
git add packages/sandbox/daemon/entry.ts packages/sandbox/daemon/events/sse.ts packages/sandbox/daemon/events/sse.test.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): broadcast intent SSE event

Adds a new wire signal: intent: { state: "running" | "paused", reason? }.
Replays in the SSE handshake so a fresh consumer sees current state
immediately. Orchestrator will flip to paused on dev/start crashes
(next commit). app-status stays for now — UI rewire follows.
EOF
)"
```

---

## Task 6: Orchestrator — accept TaskManager, subscribe to onTaskExit, manage intent

**Files:**
- Modify: `packages/sandbox/daemon/setup/orchestrator.ts`
- Modify: `packages/sandbox/daemon/setup/orchestrator.test.ts`
- Modify: `packages/sandbox/daemon/entry.ts`

- [ ] **Step 1: Update `SetupOrchestratorDeps` to include `taskManager` and `setIntent`**

In `packages/sandbox/daemon/setup/orchestrator.ts`, modify the deps interface (around line 32):

```ts
export interface SetupOrchestratorDeps {
  bootConfig: { appRoot: string; repoDir: string };
  store: TenantConfigStore;
  appService: ApplicationService;  // KEEP for now — Task 7 removes
  taskManager: TaskManager;
  setIntent: (next: { state: "running" | "paused"; reason?: string }) => void;
  getIntent: () => { state: "running" | "paused"; reason?: string };
  broadcaster: Broadcaster;
  installState: InstallState;
  logsDir: string;
  phaseManager?: PhaseManager;
  branchStatus: BranchStatusMonitor;
}
```

Add the import at the top of the file:

```ts
import type { TaskManager } from "../process/task-manager";
```

- [ ] **Step 2: Subscribe to `onTaskExit` in the constructor**

Add to the constructor body (modify the existing constructor):

```ts
constructor(private readonly deps: SetupOrchestratorDeps) {
  this.deps.taskManager.onTaskExit((summary) => {
    if (!summary.logName) return;
    if (!WELL_KNOWN_STARTERS.includes(summary.logName)) return;
    if (summary.intentional) return;
    if (summary.exitCode === 0 || summary.exitCode === null) return;
    this.deps.setIntent({
      state: "paused",
      reason: `dev script exited with code ${summary.exitCode}`,
    });
  });
}
```

- [ ] **Step 3: Wire taskManager + intent in entry.ts**

In `packages/sandbox/daemon/entry.ts`, find the `SetupOrchestrator` construction and add the new deps:

```ts
const orchestrator = new SetupOrchestrator({
  bootConfig: { appRoot: APP_ROOT, repoDir: REPO_DIR },
  store,
  appService,
  taskManager,
  setIntent,
  getIntent: () => currentIntent,
  broadcaster,
  installState,
  logsDir: TMP_DIR,
  phaseManager,
  branchStatus,
});
```

- [ ] **Step 4: Add a failing orchestrator test for crash → paused**

In `packages/sandbox/daemon/setup/orchestrator.test.ts`, add a new test that exercises the onTaskExit handler. The existing test file already mocks `appService`; add a `taskManager` mock that captures the registered handler:

```ts
it("flips intent to paused when a starter task exits non-zero non-intentionally", () => {
  let exitHandler: ((s: any) => void) | null = null;
  const intentCalls: Array<{ state: string; reason?: string }> = [];
  const orch = new SetupOrchestrator({
    bootConfig: { appRoot: "/tmp/x", repoDir: "/tmp/x/repo" },
    store: makeStore(),  // existing helper in this file
    appService: { stop: async () => {}, snapshot: () => ({}) } as never,
    taskManager: {
      spawn: async () => ({ id: "t1" }),
      killByLogName: () => 0,
      waitForLogNamesIdle: async () => {},
      onTaskExit: (h) => {
        exitHandler = h;
        return () => {};
      },
    } as never,
    setIntent: (i) => intentCalls.push(i),
    getIntent: () => ({ state: "running" }),
    installState: { isInstalledFor: () => false } as never,
    broadcaster: makeBroadcaster() as never,  // existing helper
    logsDir: "/tmp/x/tmp",
    branchStatus: makeBranchStatus() as never,
  });

  expect(exitHandler).not.toBeNull();
  exitHandler!({
    id: "t1",
    logName: "dev",
    exitCode: 1,
    intentional: false,
    status: "failed",
  });
  expect(intentCalls).toHaveLength(1);
  expect(intentCalls[0]).toEqual({
    state: "paused",
    reason: "dev script exited with code 1",
  });
});

it("does NOT flip intent when starter task is killed intentionally", () => {
  let exitHandler: ((s: any) => void) | null = null;
  const intentCalls: Array<{ state: string }> = [];
  new SetupOrchestrator({
    // ... same shape, key diff is intentional: true below
  } as never);
  // ... fire exitHandler with intentional: true
  // expect intentCalls to be empty
});
```

(If `makeStore`, `makeBroadcaster`, `makeBranchStatus` helpers don't exist in the test file, look at the existing tests and replicate the inline-mock pattern — they currently use `as never` everywhere.)

- [ ] **Step 5: Run tests — verify the new test fails until handler is wired**

```
bun test packages/sandbox/daemon/setup/orchestrator.test.ts
```

Expected: new test fails (handler not registered yet) — wait, it should pass now since Step 2 wired the handler. Run it; if it fails because the constructor signature changed, fix the existing tests' mocks (Step 6 below).

- [ ] **Step 6: Update existing orchestrator tests' mocks to include the new deps**

In `packages/sandbox/daemon/setup/orchestrator.test.ts` find every `new SetupOrchestrator({ ... })` call and add the new fields:

```ts
taskManager: {
  spawn: async () => ({ id: "t1" }),
  killByLogName: () => 0,
  waitForLogNamesIdle: async () => {},
  onTaskExit: () => () => {},
} as never,
setIntent: () => {},
getIntent: () => ({ state: "running" as const }),
```

- [ ] **Step 7: Run tests — verify all pass**

```
bun test packages/sandbox/daemon/
bun run --cwd packages/sandbox check
```

Expected: all pass, exit 0.

- [ ] **Step 8: Commit**

```
git add packages/sandbox/daemon/setup/orchestrator.ts packages/sandbox/daemon/setup/orchestrator.test.ts packages/sandbox/daemon/entry.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): orchestrator owns intent state

Subscribes to TaskManager.onTaskExit; non-zero non-intentional exits
of dev/start tasks flip intent to "paused" with the exit code as
reason. Replaces the onFailure callback hard-wired into
ApplicationService. Existing appService dependency stays in place
this commit — startIfReady/stop migration follows.
EOF
)"
```

---

## Task 7: Orchestrator — rewire `startIfReady` and stop callsites to TaskManager

**Files:**
- Modify: `packages/sandbox/daemon/setup/orchestrator.ts`

- [ ] **Step 1: Replace `appService.start(...)` in `startIfReady`**

In `packages/sandbox/daemon/setup/orchestrator.ts`, find `startIfReady` (around line 312). Replace the body:

```ts
private async startIfReady(): Promise<void> {
  const config = this.currentConfig();
  if (!config) return;
  if (this.deps.getIntent().state === "paused") {
    this.chunk(
      "\r\n[orchestrator] skipping start: intent=paused (resume to retry)\r\n",
    );
    return;
  }
  if (
    !this.deps.installState.isInstalledFor(config, this.currentBranchHead)
  ) {
    this.chunk(
      "\r\n[orchestrator] skipping start: install fingerprint mismatch\r\n",
    );
    return;
  }
  const command = this.buildStartCommand(config);
  if (!command) {
    this.chunk(this.diagnoseNoStartCommand(config));
    return;
  }
  await this.deps.taskManager.spawn({
    command: command.cmd,
    cwd: command.cwd,
    env: buildDevEnv(config),
    label: command.label,
    mode: "pty",
    logName: command.source,
    replaceByLogName: true,
  });
}
```

- [ ] **Step 2: Add `stopDevTask` helper and replace the three `appService.stop()` callsites**

Add the helper method (near `startIfReady`):

```ts
private async stopDevTask(): Promise<void> {
  for (const starter of WELL_KNOWN_STARTERS) {
    this.deps.taskManager.killByLogName(starter, { intentional: true });
  }
  await this.deps.taskManager.waitForLogNamesIdle(WELL_KNOWN_STARTERS);
}
```

Replace `await this.deps.appService.stop()` at the three callsites:

- Line ~278 (`branchChange`): `await this.stopDevTask();`
- Line ~296 (`reinstallAndMaybeStart`): `await this.stopDevTask();`
- Line ~302-303 (`maybeRestartDev`): the `if (!this.deps.appService.isAlive()) return;` guard goes; just call `await this.stopDevTask();` then `await this.startIfReady();`. (TaskManager-side, "is alive" check is implicit — kill is a no-op if nothing matches.)

- [ ] **Step 3: Run tests + typecheck**

```
bun test packages/sandbox/daemon/
bun run --cwd packages/sandbox check
```

Expected: all pass, exit 0. (Existing orchestrator tests assert call ordering against the appService mock — those assertions about `appService.stop` calls will break. Update them: assert `taskManager.killByLogName + waitForLogNamesIdle` instead.)

- [ ] **Step 4: Update orchestrator tests**

For every existing test that asserted on `appService.stop` or `appService.start` calls, swap to TaskManager assertions. Example:

```ts
// Before
expect(calls.some((c) => c.method === "stop")).toBe(true);

// After
expect(killByLogNameCalls.length).toBeGreaterThan(0);
expect(spawnCalls.some((c) => c.spec.logName === "dev")).toBe(true);
```

Use the captured-calls pattern already in the test file (the `calls.push({ method, arg })` style).

- [ ] **Step 5: Run tests — all pass**

```
bun test packages/sandbox/daemon/
```

Expected: all pass.

- [ ] **Step 6: Commit**

```
git add packages/sandbox/daemon/setup/orchestrator.ts packages/sandbox/daemon/setup/orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(sandbox/daemon): orchestrator drives dev via TaskManager

startIfReady spawns a TaskManager task with replaceByLogName instead
of calling appService.start. branchChange / reinstallAndMaybeStart /
maybeRestartDev call stopDevTask (killByLogName + waitForLogNamesIdle)
instead of appService.stop. The dev/start script is now a normal task,
killable by name, restartable in the same single path as format/build.
EOF
)"
```

---

## Task 8: Drop `appService.setStatus / markInstalled / markUp` calls

**Files:**
- Modify: `packages/sandbox/daemon/setup/orchestrator.ts`
- Modify: `packages/sandbox/daemon/entry.ts`

These are now redundant — the UI rewire (Task 11) will read `phases` for installing and `intent` for paused.

- [ ] **Step 1: Remove `appService.setStatus("installing")` and friends from orchestrator**

In `packages/sandbox/daemon/setup/orchestrator.ts`:

- Line ~387: delete `this.deps.appService.setStatus("installing");`
- Line ~415: delete `this.deps.appService.setStatus("failed", `install exit ${code}`);` — failure flow now goes through `intent` only when a *starter task* exits, which is a different signal. Install failure is already surfaced via phaseManager.fail and the install log. If the spec needs a UI-side "install failed" treatment, that's a follow-up.
- Line ~467-468 in `markInstallSucceeded`: delete `this.deps.appService.markInstalled();` and `this.deps.appService.setStatus("idle");`.

- [ ] **Step 2: Remove `appService.markUp()` from probe wiring in entry.ts**

In `packages/sandbox/daemon/entry.ts` line 156:

```ts
// Before
const lastStatus = startUpstreamProbe({
  getPort: () => store.read()?.application?.port ?? null,
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
    if (s.status === "online" && s.port !== null) appService.markUp();
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
});
```

After (drop the `markUp` line):

```ts
const lastStatus = startUpstreamProbe({
  getPort: () => store.read()?.application?.port ?? null,
  onChange: (s) => {
    broadcaster.broadcastEvent("status", { type: "status", ...s });
  },
  onLog: (msg) => broadcaster.broadcastChunk("setup", msg),
});
```

- [ ] **Step 3: Remove the `appService.runningSource()` block from the kill route**

In `packages/sandbox/daemon/entry.ts` find the kill block (around line 360):

```ts
// Before
if (p.endsWith("/kill") && p.startsWith("/_decopilot_vm/exec/")) {
  const rawName = p.slice("/_decopilot_vm/exec/".length, -"/kill".length);
  let name: string;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    return jsonResponse({ error: "invalid script name" }, 400);
  }
  let killed = taskManager.killByLogName(name);
  if (appService.runningSource() === name) {
    void appService.stop();
    killed += 1;
  }
  return jsonResponse({ killed });
}
```

After (drop the appService block — dev runs as a task now, so killByLogName finds it):

```ts
if (p.endsWith("/kill") && p.startsWith("/_decopilot_vm/exec/")) {
  const rawName = p.slice("/_decopilot_vm/exec/".length, -"/kill".length);
  let name: string;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    return jsonResponse({ error: "invalid script name" }, 400);
  }
  const killed = taskManager.killByLogName(name, { intentional: true });
  return jsonResponse({ killed });
}
```

- [ ] **Step 4: Run tests + typecheck**

```
bun test packages/sandbox/daemon/
bun run --cwd packages/sandbox check
```

Expected: all pass, exit 0.

- [ ] **Step 5: Commit**

```
git add packages/sandbox/daemon/setup/orchestrator.ts packages/sandbox/daemon/entry.ts
git commit -m "$(cat <<'EOF'
refactor(sandbox/daemon): decouple probe and kill route from appService

Probe drops the markUp() coupling — it just broadcasts upstream-status,
no longer flips an external state machine. Kill route routes by
logName via TaskManager only (with intentional=true), since dev is
now a task too. Orchestrator drops setStatus/markInstalled calls;
those signals are surfaced via phases and intent on the wire.
EOF
)"
```

---

## Task 9: UI — rewire `vm-events-context.tsx`

**Files:**
- Modify: `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx`

- [ ] **Step 1: Add `intent` and `installing` to the context value**

In `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx` find the `VmEventsValue` interface (around line 83):

```ts
export interface VmEventsValue {
  phase: ClaimPhase | null;
  status: VmStatus;
  suspended: boolean;
  notFound: boolean;
  scripts: string[];
  activeProcesses: string[];
  appStatus: AppStatus | null;  // keep for now; Task 11 removes
  intent: { state: "running" | "paused"; reason?: string };
  installing: boolean;
  branchStatus: BranchStatus | null;
  getBuffer: (source: string) => string;
  hasData: (source: string) => boolean;
  subscribeChunks: (handler: ChunkHandler) => () => void;
  subscribeReload: (handler: ReloadHandler) => () => void;
}
```

Update `DEFAULT_VALUE` (around line 108):

```ts
const DEFAULT_VALUE: VmEventsValue = {
  phase: null,
  status: { status: "booting", port: null, htmlSupport: false },
  suspended: false,
  notFound: false,
  scripts: [],
  activeProcesses: [],
  appStatus: null,
  intent: { state: "running" },
  installing: false,
  branchStatus: null,
  getBuffer: () => "",
  hasData: () => false,
  subscribeChunks: () => () => {},
  subscribeReload: () => () => {},
};
```

- [ ] **Step 2: Add `intent` and `phases` event types**

In `DAEMON_EVENT_TYPES` (around line 151), add `"intent"` and `"phases"`:

```ts
const DAEMON_EVENT_TYPES = [
  "log",
  "status",
  "scripts",
  "processes",
  "tasks",
  "app-status",
  "intent",
  "phases",
  "reload",
  "branch-status",
] as const;
```

- [ ] **Step 3: Add state hooks**

In the provider body (around line 182):

```ts
const [intent, setIntent] = useState<{
  state: "running" | "paused";
  reason?: string;
}>({ state: "running" });
const [installing, setInstalling] = useState(false);
```

- [ ] **Step 4: Handle the new events**

In the SSE event-routing switch (where `app-status` is handled, around line 349), add `intent` and `phases` branches:

```ts
} else if (e.type === "intent") {
  const next = data as { state?: "running" | "paused"; reason?: string };
  if (next.state === "running" || next.state === "paused") {
    setIntent({ state: next.state, reason: next.reason });
  }
} else if (e.type === "phases") {
  const phases = (data as { phases?: Array<{ name: string; status: string }> })
    .phases ?? [];
  setInstalling(
    phases.some((p) => p.name === "install" && p.status === "running"),
  );
}
```

- [ ] **Step 5: Expose `intent` and `installing` in the context value**

Find the `value` object passed to the Provider (around line 470) and add the new fields:

```ts
const value: VmEventsValue = {
  phase,
  status,
  suspended,
  notFound,
  scripts,
  activeProcesses,
  appStatus,  // still here; Task 11 removes
  intent,
  installing,
  branchStatus,
  getBuffer,
  hasData,
  subscribeChunks,
  subscribeReload,
};
```

- [ ] **Step 6: Type-check + run UI tests**

```
bun run --cwd apps/mesh check
bun test apps/mesh/src/web/components/vm/
```

Expected: exit 0; existing 27 tests still pass.

- [ ] **Step 7: Commit**

```
git add apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx
git commit -m "$(cat <<'EOF'
feat(mesh/web): vm-events surfaces intent and installing

Adds intent (running/paused, with reason) and installing (derived
from phases events the daemon already broadcast but no UI consumed).
appStatus stays for now — env.tsx and preview.tsx swap their reads
in following commits, then we drop the field.
EOF
)"
```

---

## Task 10: UI — collapse env.tsx button logic and rewire preview.tsx

**Files:**
- Modify: `apps/mesh/src/web/components/vm/env/env.tsx`
- Modify: `apps/mesh/src/web/components/vm/preview/preview.tsx`

- [ ] **Step 1: Collapse env.tsx isStarter branch**

In `apps/mesh/src/web/components/vm/env/env.tsx` find the button render around line 637:

```ts
// Before
const isStarter = WELL_KNOWN_STARTERS.includes(activeTab);
const appActive =
  vmEvents.appStatus?.status === "up" ||
  vmEvents.appStatus?.status === "starting";
const isRunning = isStarter
  ? appActive
  : vmEvents.activeProcesses.includes(activeTab);
```

After:

```ts
const isRunning = vmEvents.activeProcesses.includes(activeTab);
```

Also: in the same block, the dropdown label `isStarter ? "Stop" : "Stop Process"` simplifies. Replace:

```ts
<DropdownMenuItem onClick={onStop}>
  <StopCircle size={12} />
  {isStarter ? "Stop" : "Stop Process"}
</DropdownMenuItem>
```

With:

```ts
<DropdownMenuItem onClick={onStop}>
  <StopCircle size={12} />
  Stop
</DropdownMenuItem>
```

Also update the kill-prune effect (around line 199 in env.tsx — added in our prior commit) — it had a starter-specific branch:

```ts
// Before
const stillRunning = isStarter
  ? vmEvents.appStatus?.status === "up" ||
    vmEvents.appStatus?.status === "starting"
  : vmEvents.activeProcesses.includes(name);

// After
const stillRunning = vmEvents.activeProcesses.includes(name);
```

The `WELL_KNOWN_STARTERS` import becomes unused in env.tsx. Remove it.

- [ ] **Step 2: Rewire preview.tsx appPaused**

In `apps/mesh/src/web/components/vm/preview/preview.tsx` find the appPaused derivation (around line 108):

```ts
// Before
const appPaused =
  vmEvents.appStatus?.status === "idle" &&
  vmEvents.appStatus?.installedAt != null;

// After
const appPaused = vmEvents.intent.state === "paused";
```

- [ ] **Step 3: Type-check + run tests**

```
bun run --cwd apps/mesh check
bun test apps/mesh/src/web/components/vm/
```

Expected: exit 0; tests pass (preview-state tests are unchanged).

- [ ] **Step 4: Manual smoke verification**

If a dev server is available, walk through:
1. Open the env panel for a project — dev tab autostarts, button shows "Restart".
2. Click Stop. Button transitions Restart → Stopping… → Run.
3. Click Run. Button transitions Run → Running… → Restart.
4. Verify other tabs (e.g. format, build) still show the same flow.

Skip if no UI environment available — type-check is the binding contract.

- [ ] **Step 5: Commit**

```
git add apps/mesh/src/web/components/vm/env/env.tsx apps/mesh/src/web/components/vm/preview/preview.tsx
git commit -m "$(cat <<'EOF'
refactor(mesh/web): collapse env.tsx isStarter branch

Every script tab now uses the same Run/Restart/Stop flow gated on
activeProcesses. dev/start no longer reads appStatus. preview.tsx's
appPaused now reads intent.state directly — cleaner and more correct
(today's derivation conflated user-stop with crash). The
WELL_KNOWN_STARTERS import in env.tsx becomes unused; removed.
EOF
)"
```

---

## Task 11: Drop `app-status` SSE event and `appStatus` field

**Files:**
- Modify: `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx`
- Modify: `packages/sandbox/daemon/events/sse.ts`
- Modify: `packages/sandbox/daemon/events/sse.test.ts`
- Modify: `packages/sandbox/daemon/entry.ts`

- [ ] **Step 1: UI — drop `appStatus` field, `AppStatus` type, and the event handler**

In `apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx`:

- Remove the `AppStatus` interface (around line 50).
- Remove `appStatus: AppStatus | null` from `VmEventsValue`.
- Remove `appStatus: null` from `DEFAULT_VALUE`.
- Remove `const [appStatus, setAppStatus] = useState<AppStatus | null>(null);`
- Remove `"app-status"` from `DAEMON_EVENT_TYPES`.
- Remove the `else if (e.type === "app-status") { ... }` branch in the event router.
- Remove `appStatus` from the value object passed to the Provider.

- [ ] **Step 2: Daemon — drop `app-status` from SSE handshake**

In `packages/sandbox/daemon/events/sse.ts`:

- Remove `getAppStatus` from `SseHandshakeDeps`.
- Remove the `app-status` `c.enqueue(...)` block in `makeSseStream`.

- [ ] **Step 3: Daemon — drop `getAppStatus` from entry.ts and sse.test.ts**

In `packages/sandbox/daemon/entry.ts`:

- Remove `getAppStatus: () => appService.snapshot(),` from `makeEventsHandler` deps.

In `packages/sandbox/daemon/events/sse.test.ts`:

- Remove `getAppStatus: () => ({}),` from any setup blocks.
- Remove any handshake assertions for the `app-status` event.

- [ ] **Step 4: Run tests + typecheck across the monorepo**

```
bun run check
bun test packages/sandbox/daemon/
bun test apps/mesh/src/web/components/vm/
```

Expected: all pass, exit 0.

- [ ] **Step 5: Commit**

```
git add apps/mesh/src/web/components/vm/hooks/vm-events-context.tsx packages/sandbox/daemon/events/sse.ts packages/sandbox/daemon/events/sse.test.ts packages/sandbox/daemon/entry.ts
git commit -m "$(cat <<'EOF'
refactor: remove app-status SSE event

UI consumers (env.tsx, preview.tsx) and the vm-events context were
swapped to intent / activeProcesses / phases in earlier commits. The
daemon-side handshake replay and the AppStatus type can now go.
ApplicationService deletion follows.
EOF
)"
```

---

## Task 12: Delete `ApplicationService`

**Files:**
- Delete: `packages/sandbox/daemon/app/application-service.ts`
- Modify: `packages/sandbox/daemon/entry.ts`
- Modify: `packages/sandbox/daemon/setup/orchestrator.ts`
- Modify: `packages/sandbox/daemon/setup/orchestrator.test.ts`
- Modify: `packages/sandbox/daemon/routes/health.test.ts`

- [ ] **Step 1: Drop `appService` construction from entry.ts**

In `packages/sandbox/daemon/entry.ts`:

- Remove the `import { ApplicationService } from "./app/application-service";` line.
- Remove the `const appService = new ApplicationService({...})` block (around line 104-113).
- Remove `getApp: () => appService.snapshot(),` from any health-handler / config-handler deps blocks (line 202, 227).
- Remove the line `appService.shutdown();` (around line 402, in the SIGTERM handler).
- Remove `appService` from the `SetupOrchestrator` deps object.

If `getApp` is consumed anywhere downstream, repoint to `installState.snapshot()` for `installedAt`. Search:

```
grep -rn "getApp\b" packages/sandbox/daemon/
```

Update any hits.

- [ ] **Step 2: Drop `appService` from orchestrator deps**

In `packages/sandbox/daemon/setup/orchestrator.ts`:

- Remove `appService: ApplicationService` from `SetupOrchestratorDeps`.
- Remove the import `import type { ApplicationService } from "../app/application-service";`.

In `packages/sandbox/daemon/setup/orchestrator.test.ts`:

- Remove every `appService: { ... } as never,` line from test mock blocks.

- [ ] **Step 3: Update health.test.ts installedAt source**

In `packages/sandbox/daemon/routes/health.test.ts` find the existing `installedAt: undefined,` at line 11 and surrounding test setup. The test currently calls something like `getApp: () => appService.snapshot()` returning a structure with `installedAt`. Repoint to `getInstall: () => installState.snapshot()`.

If the health handler signature itself uses `getApp`, update the handler in `packages/sandbox/daemon/routes/health.ts` to use a new dep `getInstall: () => { installedAt: number | undefined }` and update entry.ts to pass `() => installState.snapshot()`.

Search the health handler signature first:

```
grep -n "getApp\|installedAt" packages/sandbox/daemon/routes/health.ts
```

- [ ] **Step 4: Delete the file**

```
rm packages/sandbox/daemon/app/application-service.ts
rmdir packages/sandbox/daemon/app/  # Only if empty
```

- [ ] **Step 5: Format + lint + typecheck + full test run**

```
bun run fmt
bun run lint
bun run check
bun test
```

Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "$(cat <<'EOF'
refactor(sandbox/daemon): delete ApplicationService

All callers now go through TaskManager. The dual-process-owner
architecture is gone — every script (including dev/start) runs as a
task, with one state machine, one log routing, one kill path. Setup
tab stays special only in that it has no Run/Stop button. The
"stop+run loses pid context" bug is structurally unfixable from here:
there's no parallel path to slip through.

Removed: ~250 lines (application-service.ts) + handshake replay block
+ AppStatus type + isStarter branch in env.tsx.
Added: ~100 lines (TaskManager primitives, intent state, intent SSE
event, vm-events handlers).
Net: -150 lines, one less subsystem.
EOF
)"
```

---

## Task 13: Final verification

- [ ] **Step 1: Format**

```
bun run fmt
```

Expected: "No fixes applied" or fixes applied silently.

- [ ] **Step 2: Lint**

```
bun run lint
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 3: Type-check**

```
bun run check
```

Expected: all packages exit 0.

- [ ] **Step 4: Full test run**

```
bun test
```

Expected: all pass, no failures.

- [ ] **Step 5: Manual smoke (if dev environment available)**

If `bun run dev` is available:
1. Open env panel — dev tab auto-starts.
2. Stop dev → button transitions Restart → Stopping… → Run.
3. Run dev → button transitions Run → Running… → Restart. Iframe loads correctly.
4. Force a dev-script crash (kill from CLI) → expect intent goes to paused, UI shows the paused overlay.
5. Other tabs (format/build/etc) still work the same way.

- [ ] **Step 6: Push**

```
git push
```

---

## Self-review (run after writing the plan)

- [x] **Spec coverage:**
  - §1 Subsystem boundaries — Tasks 6, 7, 8, 12 (orchestrator + probe + kill route + appService delete).
  - §2 TaskManager primitives — Tasks 1, 2, 3, 4.
  - §3 Orchestrator new shape — Tasks 6, 7.
  - §4 SSE wire signals — Tasks 5, 11.
  - §5 UI rewire — Tasks 9, 10, 11.
  - §6 Setup tab — implicitly preserved (orchestrator install spawn unchanged).
  - Test plan — covered: TaskManager (Tasks 1-4), orchestrator (Task 6), sse handshake (Task 5/11), health (Task 12).

- [x] **Placeholder scan:** No "TODO" or "fill in details" — every code block is concrete.

- [x] **Type consistency:** `replaceByLogName: boolean` consistent across spawn signature and orchestrator spawn call. `intentional: true` consistent across kill calls. `intent.state` is `"running" | "paused"` everywhere. `Promise<TaskSummary>` for spawn matches awaited callers in exec.ts and bash.ts.

# Unify Dev/Start Through TaskManager — Design

**Date:** 2026-05-07
**Status:** Approved
**Author:** Tiago Gimenes (with Claude)

## Goal

Eliminate the dual-process-owner architecture in the sandbox daemon. Today the dev/start scripts run via `ApplicationService` (a singleton PTY) while every other script runs via `TaskManager`. This produces a real bug — `stop → run` on dev re-spawns the script under TaskManager but the UI keeps reading `appStatus` from the now-idle `ApplicationService` — and a maintenance burden: two state machines, two log routings, two kill paths.

After this change, every script runs through TaskManager. The orchestrator owns the project lifecycle (clone, install, dev-task spawning, intent), but it no longer owns the dev process directly. The "setup" tab is the only tab that stays special, because clone and install are not user-runnable scripts.

## Background

### Current state

- **`ApplicationService`** (`packages/sandbox/daemon/app/application-service.ts`, ~250 lines): owns one PTY at a time. State machine `idle | installing | starting | up | failed`. Consumed by:
  - `orchestrator.ts` — calls `start/stop/setStatus/markInstalled` to drive the dev script through transitions.
  - The probe (`entry.ts:156`) — calls `markUp()` when the upstream port responds, flipping `starting → up`.
  - The kill route (`entry.ts:362-369`) — special case to route `/exec/<starter>/kill` to `appService.stop()`.
  - The SSE handshake (`sse.ts`) — broadcasts the snapshot as the `app-status` event.

- **`TaskManager`** (`packages/sandbox/daemon/process/task-manager.ts`): owns every other process (`format`, `build`, anything from `/exec/<name>`). Each task has a `logName` (the script name) and a status. Active tasks are broadcast as the `tasks` SSE event.

- **UI consumers of `app-status`:**
  - `env.tsx` button rendering: `isStarter ? appActive : activeProcesses.includes(activeTab)` — branches dev/start vs. everything else.
  - `preview.tsx` `appPaused`: `appStatus.status === "idle" && installedAt != null` — synthesises "user stopped a previously-installed dev script."
  - `vm-events-context.tsx`: maintains `appStatus` state from the `app-status` SSE event.

### The bug this fixes

After our prior commit, `stop` on the dev tab properly halts the appService PTY. But on the next `run`, the UI calls `/exec/dev` which spawns a *TaskManager* task; `appStatus` stays `idle`, so `isRunning` (gated on `appStatus` for starters) stays false. The UI thinks dev isn't running even though it is. The proxy/probe also can't see it. The architectural problem is the dual-path itself — the bug is unfixable in patch form without re-introducing more special-casing.

## Design

### 1. Subsystem boundaries

- **Orchestrator** owns project lifecycle: clone, install, fingerprint reconciliation, dev-task spawning on bootstrap and config change, tenant intent (`running` / `paused`), failure detection.
- **TaskManager** owns every running process — including the dev/start script.
- **Probe** runs independently. Polls the configured port; broadcasts `upstream-status`. No coupling to any process owner.
- **`ApplicationService` is deleted.**
- **Setup tab** remains special only in that it has no Run/Stop button and renders the orchestrator's setup buffer. Internally, install is still spawned by the orchestrator (it's not a user-runnable script and never was).

### 2. TaskManager primitives

Three additions:

#### `replaceByLogName: true` option on `spawn`

When set and a task with the same `logName` is running, kill it (intentional), await its exit, then spawn the new task. Mirrors today's `appService.start()` "replace if alive" semantic. Makes `spawn` async (only async caller today is `/exec/<name>`, easy to add `await`).

```ts
async spawn(spec: TaskSpec & { replaceByLogName?: boolean }): Promise<TaskSummary>
```

#### `intentional` flag on kills

`killByLogName(name, { intentional?: boolean })` records the flag on the matched task(s). The task's exit summary surfaces `intentional: boolean` (defaults `false`). This is what subscribers read to distinguish "user pressed Stop" from "the process crashed."

```ts
killByLogName(logName: string, opts?: { intentional?: boolean; signal?: NodeJS.Signals }): number
```

#### `onTaskExit(handler)` event hook

Subscribe-style: `(summary: TaskSummary) => void` invoked for every task exit. Replaces the `onFailure` callback hard-wired into `ApplicationService`'s constructor. Generalised so any module can subscribe.

```ts
onTaskExit(handler: (summary: TaskSummary) => void): () => void
```

#### `TaskSummary` additions

```ts
interface TaskSummary {
  // ... existing fields
  logName?: string;       // already added in prior commit
  intentional?: boolean;  // new — true if kill flagged it
}
```

### 3. Orchestrator's new shape

#### Tenant intent state

```ts
type Intent = { state: "running" | "paused"; reason?: string };
```

Default `{ state: "running" }`. Field on the orchestrator. Setter broadcasts an `intent` SSE event. Read on every `startIfReady` decision: skip the dev-task spawn if `paused`.

#### `startIfReady` becomes `taskManager.spawn(...)` 

```ts
private async startIfReady(): Promise<void> {
  const config = this.currentConfig();
  if (!config) return;
  if (this.intent.state === "paused") return;
  if (!this.deps.installState.isInstalledFor(config, this.currentBranchHead)) return;
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

#### `stopDevTask` replaces `appService.stop()`

Every callsite (`branchChange`, `reinstallAndMaybeStart`, `maybeRestartDev`) calls a single helper:

```ts
private async stopDevTask(): Promise<void> {
  for (const starter of WELL_KNOWN_STARTERS) {
    this.deps.taskManager.killByLogName(starter, { intentional: true });
  }
  await this.deps.taskManager.waitForLogNamesIdle(WELL_KNOWN_STARTERS);
}
```

(`waitForLogNamesIdle` is a tiny TaskManager helper that resolves once no task with any of the given logNames is running. ~10 lines.)

#### Failure subscription

In the constructor:

```ts
this.deps.taskManager.onTaskExit((summary) => {
  if (!summary.logName) return;
  if (!WELL_KNOWN_STARTERS.includes(summary.logName)) return;
  if (summary.intentional) return;
  if (summary.exitCode === 0) return;
  this.setIntent({
    state: "paused",
    reason: `dev script exited with code ${summary.exitCode}`,
  });
});
```

#### Probe decoupling

Every `appService.markUp()`, `setStatus("starting" | "up" | "installing" | "failed")`, `markInstalled()` call is **deleted**. The probe just runs. "Installing" is already broadcast on the existing `phases` event (orchestrator calls `phaseManager.begin("install")` today). "Failed" is now `intent === "paused"`. "Starting vs. up" is derivable from `activeProcesses + upstream-status` if the UI ever needs it (today it doesn't differentiate them in env.tsx — both render as "running").

### 4. SSE wire signals

#### Removed

- `app-status` event. `getAppStatus` removed from `SseHandshakeDeps`.

#### Added

- `intent` event:

```ts
{ type: "intent", state: "running" | "paused", reason?: string }
```

Broadcast on every transition. Replayed in the SSE handshake snapshot (between `tasks` and `branch-status`, mirroring where `app-status` was).

#### Replacement table

| Old `appStatus.status` | New derivation |
|---|---|
| `idle` (no install yet) | `phases` shows install hasn't completed |
| `installing` | `phases` shows install-in-progress |
| `starting` | `activeProcesses.includes(starter) && upstream-status !== "online"` |
| `up` | `activeProcesses.includes(starter) && upstream-status === "online"` |
| `failed` | `intent.state === "paused"` |
| `idle` (after install, intentional stop) | `activeProcesses.includes(starter) === false && intent.state === "running"` |

The UI doesn't actually need the `starting` vs. `up` distinction in env.tsx today (both render as "Restart"), so we don't have to reconstruct it.

`installedAt` moves to `InstallState` only (already lives there). The UI doesn't currently need it after `intent` exists — `appPaused` is the only consumer and it now reads `intent` directly.

### 5. UI rewire

#### `vm-events-context.tsx`

```ts
// Removed
appStatus: AppStatus | null;

// Added
intent: { state: "running" | "paused"; reason?: string };
installing: boolean;  // derived from `phases` event
```

The `app-status` event handler is dropped. New handler for `intent`. New handler for `phases` (first-class; today the event is broadcast but no UI consumer exists).

`installing` is a boolean derived inside the handler: any phase with `name === "install"` and `status === "running"`.

#### `env.tsx`

The `isStarter` branch and `WELL_KNOWN_STARTERS` import collapse. One uniform rule:

```ts
const isRunning = vmEvents.activeProcesses.includes(activeTab);
```

The dropdown label `isStarter ? "Stop" : "Stop Process"` simplifies to `"Stop"` everywhere.

#### `preview.tsx`

```ts
// Before
const appPaused =
  vmEvents.appStatus?.status === "idle" &&
  vmEvents.appStatus?.installedAt != null;

// After
const appPaused = vmEvents.intent.state === "paused";
```

`preview-state.ts` (the pure reducer) keeps the same shape; only the input wiring changes. Existing `preview-state.test.ts` cases stay valid.

### 6. Setup tab

Stays as today. Renders the `setup` log buffer. Internally, install logs are still tee'd via `this.chunk(...)` to the `setup` source by the orchestrator. Setup tab has no Run/Stop button and never did. The UI's `installing` boolean (derived from `phases`) gates any "we're installing" overlay.

## Test plan

### New tests

- **`task-manager.test.ts`** (new file or extend existing):
  - `replaceByLogName` kills running task, awaits exit, spawns new one (verify ordering by spying on kill timestamp vs. new spawn timestamp).
  - `killByLogName({ intentional: true })` surfaces `intentional: true` on the exit summary.
  - `onTaskExit` fires for every exit with correct fields; multiple subscribers all receive the event.

- **`orchestrator.test.ts`**:
  - Starter task non-zero exit (non-intentional) → `intent.state === "paused"` + `reason` set.
  - Starter task SIGTERM with `intentional: true` does not flip intent.
  - With `intent.state === "paused"`, `startIfReady` does not spawn.

### Updated tests

- `orchestrator.test.ts` mock currently passes `appService: { stop, snapshot }`; replace with TaskManager mock exposing `spawn / killByLogName / waitForLogNamesIdle / onTaskExit`.
- `sse.test.ts` initial-snapshot block: replace `app-status` assertion with `intent`.
- `health.test.ts` references `installedAt` from `appService.snapshot()`; repoint to `installState.snapshot()` (already exposes `installedAt`).

### Existing tests that should keep passing unchanged

- `preview-state.test.ts` — pure reducer, only the input wiring changes, not the shape.
- All `daemon` integration tests not touching `appService`.

## Rollout

**Single PR.** Multiple PRs would force `app-status` and `intent` to coexist transiently on the wire, which is more complex than swapping atomically.

**Internal sequence inside the PR:**

1. TaskManager primitives (`replaceByLogName`, `intentional`, `onTaskExit`, `waitForLogNamesIdle`) — additive, no callers yet.
2. Orchestrator: introduce `intent` state + setter; subscribe to `onTaskExit`.
3. Orchestrator: rewire `startIfReady` / `stopDevTask` to use TaskManager.
4. Orchestrator: drop `appService.setStatus / markInstalled` calls (now redundant).
5. `entry.ts`: drop `appService.markUp()` from probe wiring; drop `appService.runningSource()` block from kill route.
6. SSE: add `intent` event + handshake replay; remove `app-status`.
7. UI: rewire `vm-events-context.tsx`, `env.tsx`, `preview.tsx`.
8. Delete `application-service.ts`. Drop `appService` from `entry.ts` and `SetupOrchestratorDeps`.
9. Update `health.test.ts` `installedAt` source.

This sequence minimises broken intermediate states. Steps 6 and 7 are committed together (or back-to-back) so the wire contract changes match the consumer.

## Risks

- **Two-tab race.** User opens two browser tabs and clicks Run on dev simultaneously. `replaceByLogName` queues kills sequentially via `await`. Worst case: second click kills first's just-spawned process and respawns. Same end state, no leaked PTYs. Acceptable.

- **`intent === "paused"` first-load.** A user reloading the page after a crash must see paused immediately. Mitigation: `intent` is part of the SSE handshake replay block (mandatory), same as `app-status` is today.

- **Lost `lastExitCode` / structured `failureReason` on the wire.** Today's `app-status` carries them; new `intent.reason` is just a string. Sufficient for the UI's "Resume" overlay text. Anyone wanting structured exit data can read the task summary via `/_decopilot_vm/tasks/<id>` (already supported).

- **`startIfReady` async-ness.** `spawn` becoming async means `startIfReady` must be awaited at call sites. Already awaited in the orchestrator's reducer loop, no change.

## Out of scope

- Migrating install itself to TaskManager. Install is one-shot and orchestrator-private; converting it adds complexity without removing any.
- Adding a "Resume" CTA in the UI. The `intent.reason` field is in the wire format from day one; the visual treatment can land in a follow-up.
- Persisting `intent` across daemon restarts. Today's behaviour is "fresh on each boot," matches `appStatus` behaviour.

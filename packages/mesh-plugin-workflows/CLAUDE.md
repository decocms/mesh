# Workflow Plugin - Architecture

## Overview

Event-driven workflow execution engine using the mesh event bus for external triggers and an event-driven step coordination model. Steps execute via fire-and-forget events, with atomic checkpointing and crash recovery on startup.

## Execution Model

The engine is a **pure DAG** (Directed Acyclic Graph). Steps run once, data flows forward, no cycles. Execution order is auto-determined from `@ref` dependencies — steps with no dependencies run in parallel, steps referencing `@stepName` wait for that step.

### Step Types

- **Tool call** (`{ toolName }`) — Invoke an MCP tool via proxy. Optional `transformCode` for post-processing.
- **Code** (`{ code }`) — Run TypeScript in QuickJS sandbox. Format: `export default function(input) { ... }`
- **Return** (`{ return: true }`) — Exit the workflow early with success. Step's resolved input becomes workflow output. *(planned)*

### Data Flow

Steps wire data via `@ref` syntax:
- `@input.field` — workflow input
- `@stepName.field` — output from a completed step
- `@item` / `@index` — forEach iteration context

## Conditional Execution (`when`) — Planned

### Problem

No way to skip steps based on runtime conditions or exit a workflow early without error. Every step always runs.

### Design: Structured `when` condition

Add an optional `when` field to Step — a **structured condition object**, not code or expression strings. This is critical for three reasons:
1. **UI-friendly**: renders as form fields (ref picker + operator + value), editable by non-technical users
2. **LLM-friendly**: structured JSON matches tool-use training, less error-prone than expression strings
3. **No parser needed**: Zod validates the shape, engine evaluates with simple comparisons

```typescript
when?: {
  ref: string;        // @ref to resolve, e.g. "@validate.eligible"
  // At most one operator. If none specified: truthy check.
  eq?: unknown;       // step runs if resolved value equals this
  neq?: unknown;      // step runs if resolved value does NOT equal this
  gt?: number;        // step runs if resolved value > this
  lt?: number;        // step runs if resolved value < this
}
```

**Evaluation happens at dispatch time** (before the step is sent to the event bus):
- Resolve the `ref` using the existing @ref resolver
- Apply the operator (or truthy check if no operator)
- If false: mark step as completed with `output: null`, set `skipped` flag, publish `step.completed`
- If true: dispatch normally

**The `when` ref is also a DAG dependency** — `when: { ref: "@validate.ok" }` means the step depends on `validate`.

**Skipped steps cascade**: downstream steps that reference a skipped step get `null` for its output. If they also have a `when` that checks truthiness on that output, they'll be skipped too.

### UI rendering

```
┌──────────────────────────────────────────────┐
│  Step: send_notification                     │
│  When: [@classify.urgent ▾] [is ▾] [true  ]  │
│  Action: Tool Call → SEND_EMAIL              │
└──────────────────────────────────────────────┘
```

Three form fields: ref picker (dropdown of step outputs), operator (is/is not/>/</exists), value input.

### Examples

```json
{ "when": { "ref": "@validate.eligible" } }
{ "when": { "ref": "@validate.eligible", "eq": true } }
{ "when": { "ref": "@fetch.count", "gt": 0 } }
{ "when": { "ref": "@classify.priority", "neq": "low" } }
```

### Why not other approaches

- **Expression strings** (`"@step.count > 0"`): need a parser, hard to decompose into form fields in UI
- **Code conditions**: code steps as string blobs in JSON are terrible UX in a visual editor, non-technical users can't read/edit them
- **AWS Step Functions-style Choice state**: extremely verbose, terrible for LLMs to author
- **Just truthy checks** (`when: "@step.valid"`): too limiting, forces extra "evaluator" code steps for every non-boolean condition

## Early Exit (`return` action) — Planned

### Problem

No way to exit a workflow early with a success result (e.g., "if input is invalid, return error message without running remaining steps").

### Design: `return` as a step action type

```typescript
{ return: z.literal(true) }
```

When a `return` step executes:
1. Step's resolved `input` is set as its output (passthrough — no code to execute)
2. `handleStepCompleted` detects the `return` action → marks execution as `success` with the step's output
3. In-flight steps complete harmlessly (execution already in `success` state, `isWorkflowRunning` check stops further orchestration)

Combined with `when` for conditional early exit:

```json
{
  "steps": [
    {
      "name": "validate",
      "action": { "code": "export default function(input) { const ok = !!input.email; return { ok, notOk: !ok, error: ok ? null : 'Email required' } }" },
      "input": { "email": "@input.email" }
    },
    {
      "name": "exit_if_invalid",
      "when": { "ref": "@validate.notOk", "eq": true },
      "action": { "return": true },
      "input": { "error": "@validate.error" }
    },
    {
      "name": "create_user",
      "when": { "ref": "@validate.ok", "eq": true },
      "action": { "toolName": "CREATE_USER" },
      "input": { "email": "@input.email" }
    }
  ]
}
```

## Recording Mode — Planned

### Concept: The execution IS the workspace

Instead of "define workflow → execute it", recording mode inverts the flow: **start an empty execution → LLM calls tools naturally → each tool call is recorded as a workflow step → save as reusable template when done.**

The LLM doesn't manage workflow structure. It just calls MCP tools. Mesh — already sitting as the proxy between client and server — intercepts each tool call and transparently builds the DAG.

### How it works

```
LLM → callTool("GET_USER", { id: "@input.user_id" })
         │
         ▼
   Mesh Proxy (recording mode)
         │
         ├─→ 1. Append step to execution: { name: "get_user_1", action: { toolName: "GET_USER" }, input: { id: "@input.user_id" } }
         ├─→ 2. Resolve @refs → literal values
         ├─→ 3. Forward to real MCP server
         ├─→ 4. Save result as step output
         ├─→ 5. Return result to LLM
         │
         ▼
   LLM sees normal tool result (doesn't know a workflow is being built)
```

The proxy already does step 3. Recording mode wraps it with 1, 2, 4, 5.

### @ref resolution strategy

When the LLM calls `GET_ORDERS({ userId: 42 })`, the literal `42` came from a previous `GET_USER` call. For the template to be reusable, we need `@get_user_1.id` instead of `42`.

**Approach: teach the LLM to use @refs in tool inputs.** The proxy resolves them before forwarding. The LLM calls `GET_ORDERS({ userId: "@get_user_1.id" })`, proxy resolves to `42`, forwards `{ userId: 42 }` to the tool. The step is recorded with the @ref intact.

This is lightweight — the LLM just needs "when referencing outputs from previous tool calls, use `@step_name.field`" in the system prompt. It's essentially variable naming, which is core to tool-use training. The LLM is good at this.

Alternative for cases where the LLM uses literal values: **post-hoc templatization** — after recording, match output values to input values across steps and reconstruct @refs heuristically. Present detected refs in the UI for user confirmation.

### Two execution modes

| | Auto mode (current) | Recording mode (planned) |
|---|---|---|
| Steps dispatched | Automatically when deps met | By the LLM via tool calls through the proxy |
| Workflow definition | Immutable snapshot at creation | Built incrementally as tools are called |
| @refs resolved by | Engine at dispatch time | Proxy at intercept time |
| Use case | Production runs, scheduled triggers | LLM conversations, interactive building |
| Completion | All steps done → success | User/LLM saves as template or ends session |

The **same execution engine** handles both modes. Auto mode = current behavior. Recording mode = proxy intercepts tool calls and appends steps. The orchestrator, storage, step execution, @ref resolution are all unchanged.

### What you end up with after a conversation

1. A **completed execution** with all step results (observable, debuggable)
2. A **workflow definition** extracted from the recorded steps (saveable as template)
3. The ability to **replay** the workflow with different `@input` values (auto mode)
4. The ability to **edit** the template in the UI (add `when` conditions, tweak inputs, rearrange steps)

The LLM authored the workflow by just doing its job. The user polishes it in the UI. No one had to think about DAGs.

### Preset step results

In recording mode, step results can also be set without executing the tool:
- Inject known data the user already has
- Resume a paused recording with new input data
- Mock specific steps during testing

There's no explicit pause/resume mechanism needed. In recording mode, the execution just waits — steps only run when the LLM makes tool calls. The execution sits with its accumulated results, and anyone can come back later.

### Implementation surface

- **Proxy intercept layer**: wrap the Virtual MCP proxy's `callTool` to record steps when in recording mode
- **Mutable workflow definition**: allow appending steps to a running execution (currently the step list is immutable)
- **Save-as-template tool**: extract the recorded execution's steps into a `workflow_collection` entry
- **Preset result tool**: set a step's output without executing it

No new event types, no changes to the DAG model, no changes to step execution logic.

## Loops and Mutable State — Intentionally Not Supported

### Why the engine is a DAG, not a state machine

The workflow engine deliberately avoids loops, shared mutable state, and cyclic execution. These require a fundamentally different execution model (like Temporal.io or XState) with 10x the complexity:

| DAG (current) | State machine |
|---|---|
| Steps run once | Steps can re-execute |
| Data flows forward | State can flow backward |
| No cycles | Cycles are the point |
| Completion = all steps done | Completion = condition met |
| Trivial to visualize | Visualization is hard |
| Crash recovery = replay from last checkpoint | Crash recovery = restore full state + position |

### Recursive workflows as an escape hatch

For use cases that need iteration (LLM agent loops, polling, iterative refinement), the pattern is **recursive workflow invocation**: a step creates a new execution of the same workflow with updated input.

```
Execution 1: do_work → evaluate → not done → create Execution 2
Execution 2: do_work → evaluate → not done → create Execution 3
Execution 3: do_work → evaluate → done → return result
```

Each iteration is a separate execution — fully observable, individually debuggable, no cycles in any single DAG. This is modeled with a tool step that calls `COLLECTION_WORKFLOW_EXECUTION_CREATE` with the same `workflow_collection_id` but different input.

## Timeout Strategy

The engine does **not** implement its own step-level or heartbeat-based timeout mechanisms. Instead, it relies on the inherent timeout guarantees of each step type:

- **Tool steps**: The MCP proxy `callTool()` accepts a `timeout` option (default 30s). If the tool call exceeds this, the proxy returns an error which is lifted to the step result.
- **Code steps**: The QuickJS sandbox uses `interruptAfterMs` (default 10s). Code that exceeds this is interrupted and returns an error.
- **Workflow-level deadline**: If `timeoutMs` is set on execution creation, a `deadline_at_epoch_ms` is computed. The orchestrator checks this deadline in `handleExecutionCreated` and `handleStepCompleted` — if exceeded, the execution is failed with a deadline error.

### What was removed (and why)

- **`heartbeat_at_epoch_ms` column + sweeper**: The heartbeat only updated *after* a step completed, so a long-running tool call (e.g. 5 minutes) would trigger the 60s staleness threshold, causing false-positive recovery of healthy executions. Removed via migration `004-drop-heartbeat`.
- **`workflow.step.timeout` event**: Redundant — tool calls and code steps already have their own timeouts that surface errors through the normal step result flow.
- **`workflow.execution.timeout` scheduled event**: Replaced by a synchronous deadline check in `handleStepCompleted` and `handleExecutionCreated`. No need for a separate scheduled event.

## Crash Recovery

- **On startup**: `recoverStuckExecutions()` finds all `running` executions, clears incomplete step results (stale claims), resets them to `enqueued`, and re-publishes `workflow.execution.created` events.
- **Idempotent claims**: Both `claimExecution()` (execution-level) and `createStepResult()` (step-level, via `ON CONFLICT DO NOTHING`) are idempotent, so duplicate events are safely ignored.

## Event Types

Only three event types are used:

| Event | Purpose |
|-------|---------|
| `workflow.execution.created` | External trigger to start/resume an execution |
| `workflow.step.execute` | Dispatched by orchestrator to execute a step |
| `workflow.step.completed` | Notification that a step result has been persisted |

## Files

| File | Purpose |
|------|---------|
| `server/engine/orchestrator.ts` | Core orchestration: claim, dispatch, complete |
| `server/engine/code-step.ts` | QuickJS sandbox execution |
| `server/engine/tool-step.ts` | MCP proxy tool calls |
| `server/engine/ref-resolver.ts` | `@ref` resolution for step inputs |
| `server/events/handler.ts` | Event routing + fire-and-forget dispatch |
| `server/storage/workflow-execution.ts` | DB operations for executions + step results |
| `server/storage/workflow-collection.ts` | DB operations for workflow templates |
| `server/storage/types.ts` | Kysely table interfaces |
| `server/index.ts` | Plugin registration + startup recovery |
| `server/tools/` | MCP tools (collection CRUD + execution management) |

## Implementation Checklist (when + return)

### Schema changes (`packages/bindings/src/well-known/workflow.ts`)
- [ ] Add `StepConditionSchema` (ref, eq, neq, gt, lt)
- [ ] Add `when?: StepConditionSchema` to `StepSchema`
- [ ] Add `ReturnActionSchema` to `StepActionSchema` union
- [ ] Update `getStepDependencies` / `getAllRefs` to extract refs from `when.ref`

### Engine changes (`server/engine/orchestrator.ts`)
- [ ] In `dispatchStep`: evaluate `when` condition before dispatching (skip if false)
- [ ] In `getReadySteps`: include `when` ref as a dependency for ordering
- [ ] In `handleStepExecute`: handle `return` action (passthrough input → output)
- [ ] In `handleStepCompleted`: detect `return` action → mark execution as `success`
- [ ] Skipped steps: mark completed with `output: null` + publish `step.completed`

### No migration needed
- `output: null` already supported in step results
- `skipped` flag is optional metadata on the step result (no new column required)

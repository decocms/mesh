/**
 * Workflow Orchestrator
 *
 * Event-driven workflow execution engine.
 * All steps are fire-and-forget via the event bus.
 *
 * Ported from MCP Studio, adapted to use Kysely storage and Mesh event bus.
 */

import { validateNoCycles, type Step } from "@decocms/bindings/workflow";
import type {
  WorkflowExecutionStorage,
  ParsedStepResult,
} from "../storage/workflow-execution";
import { extractRefs, parseAtRef, resolveAllRefs } from "./ref-resolver";
import { executeCode } from "./code-step";
import { executeToolStep, type ToolStepContext } from "./tool-step";

// ---------------------------------------------------------------------------
// Debug logger
// ---------------------------------------------------------------------------

class OrchestratorLog {
  private t0: number;

  constructor() {
    this.t0 = performance.now();
  }

  private ts(): string {
    return `+${(performance.now() - this.t0).toFixed(1)}ms`;
  }

  info(msg: string, extra?: Record<string, unknown>): void {
    const parts = [`[WF:orch] ${this.ts()} ${msg}`];
    if (extra) parts.push(JSON.stringify(extra));
    console.log(parts.join(" "));
  }
}

// ============================================================================
// Types
// ============================================================================

type StepType = "tool" | "code";

function getStepType(step: Step): StepType {
  if ("toolName" in step.action) return "tool";
  if ("code" in step.action) return "code";
  throw new Error(`Unknown step type for step: ${step.name}`);
}

type OnError = "fail" | "continue";

/**
 * Publish function signature (injected by the event handler)
 */
export type PublishEventFn = (
  type: string,
  subject: string,
  data?: Record<string, unknown>,
  options?: { deliverAt?: string },
) => Promise<void>;

/**
 * Context for orchestrator operations
 */
export interface OrchestratorContext {
  storage: WorkflowExecutionStorage;
  publish: PublishEventFn;
  createMCPProxy: ToolStepContext["createMCPProxy"];
}

// ============================================================================
// Dependency resolution
// ============================================================================

/**
 * Extract step dependencies from @refs in step input and forEach config.
 */
function getStepDependencies(step: Step): string[] {
  const refs = extractRefs(step.input);

  if (step.forEach?.ref) {
    refs.push(step.forEach.ref);
  }

  const deps = new Set<string>();
  for (const ref of refs) {
    if (ref.startsWith("@")) {
      const parsed = parseAtRef(ref as `@${string}`);
      if (parsed.type === "step" && parsed.stepName) {
        deps.add(parsed.stepName);
      }
    }
  }

  return Array.from(deps);
}

function isForEachStep(step: Step): boolean {
  return !!step.forEach?.ref;
}

/**
 * Get terminal steps (steps that no other step depends on).
 * These are the "leaf" nodes of the DAG whose outputs form the workflow result.
 */
function getTerminalSteps(steps: Step[]): Step[] {
  const allDeps = new Set(steps.flatMap(getStepDependencies));
  return steps.filter((s) => !allDeps.has(s.name));
}

/**
 * Build the workflow output from terminal step outputs.
 * - If there is exactly 1 terminal step, use its output directly.
 * - If there are multiple terminal steps, return a Record keyed by step name.
 */
function buildWorkflowOutput(
  steps: Step[],
  stepOutputs: Map<string, unknown>,
): unknown {
  const terminalSteps = getTerminalSteps(steps);
  if (terminalSteps.length === 1 && terminalSteps[0]) {
    return stepOutputs.get(terminalSteps[0].name);
  }
  const output: Record<string, unknown> = {};
  for (const step of terminalSteps) {
    output[step.name] = stepOutputs.get(step.name);
  }
  return output;
}

/**
 * Get steps that are ready to execute (all dependencies satisfied).
 */
function getReadySteps(
  steps: Step[],
  completedStepNames: Set<string>,
  claimedStepNames: Set<string>,
): Step[] {
  return steps.filter((step) => {
    if (completedStepNames.has(step.name) || claimedStepNames.has(step.name)) {
      return false;
    }
    const deps = getStepDependencies(step);
    return deps.every((dep) => completedStepNames.has(dep));
  });
}

// ============================================================================
// Orchestration set builders
// ============================================================================

function buildStepOutputsMap(
  stepResults: ParsedStepResult[],
): Map<string, unknown> {
  const stepOutputs = new Map<string, unknown>();
  for (const result of stepResults) {
    if (result.completed_at_epoch_ms) {
      stepOutputs.set(result.step_id, result.output);
    }
  }
  return stepOutputs;
}

function buildOrchestrationSets(stepResults: ParsedStepResult[]): {
  completedStepNames: Set<string>;
  claimedStepNames: Set<string>;
  stepOutputs: Map<string, unknown>;
} {
  const completedStepNames = new Set<string>();
  const claimedStepNames = new Set<string>();
  const stepOutputs = new Map<string, unknown>();

  for (const result of stepResults) {
    // Skip iteration results (they have [N] suffix)
    if (result.step_id.includes("[")) continue;

    if (result.completed_at_epoch_ms) {
      completedStepNames.add(result.step_id);
      stepOutputs.set(result.step_id, result.output);
    } else {
      claimedStepNames.add(result.step_id);
    }
  }

  return { completedStepNames, claimedStepNames, stepOutputs };
}

// ============================================================================
// Event handlers
// ============================================================================

/**
 * Handle workflow.execution.created event
 *
 * Claims the execution and dispatches events for all ready steps.
 */
export async function handleExecutionCreated(
  ctx: OrchestratorContext,
  executionId: string,
): Promise<void> {
  const log = new OrchestratorLog();
  const eid = executionId.slice(0, 8);
  log.info(`executionCreated ${eid} — claiming`);

  const claimed = await ctx.storage.claimExecution(executionId);
  if (!claimed) {
    log.info(`executionCreated ${eid} — already claimed, skipping`);
    return;
  }

  const { execution, workflow } = claimed;
  const steps = workflow.steps;

  // Check if deadline already passed (e.g. scheduled execution that was delayed)
  const deadlineAtEpochMs = execution.deadline_at_epoch_ms;
  if (deadlineAtEpochMs && Date.now() >= deadlineAtEpochMs) {
    log.info(`executionCreated ${eid} — deadline already passed, failing`);
    await ctx.storage.updateExecution(executionId, {
      status: "error",
      error: "Workflow execution exceeded its deadline",
      completed_at_epoch_ms: Date.now(),
    });
    return;
  }

  if (!steps?.length) {
    await ctx.storage.updateExecution(executionId, {
      status: "error",
      error: "Workflow has no steps",
      completed_at_epoch_ms: Date.now(),
    });
    return;
  }

  // Validate DAG
  const validation = validateNoCycles(steps);
  if (!validation.isValid) {
    await ctx.storage.updateExecution(executionId, {
      status: "error",
      error: validation.error,
      completed_at_epoch_ms: Date.now(),
    });
    return;
  }

  const workflowInput =
    typeof workflow.input === "string"
      ? JSON.parse(workflow.input as string)
      : (workflow.input ?? {});

  // Check for existing step results (recovery case: some steps may already be completed)
  const existingResults = await ctx.storage.getStepResults(executionId);
  const { completedStepNames, claimedStepNames, stepOutputs } =
    existingResults.length > 0
      ? buildOrchestrationSets(existingResults)
      : {
          completedStepNames: new Set<string>(),
          claimedStepNames: new Set<string>(),
          stepOutputs: new Map<string, unknown>(),
        };

  // Check if workflow is already complete (all steps done from before crash)
  if (completedStepNames.size === steps.length) {
    await ctx.storage.updateExecution(
      executionId,
      {
        status: "success",
        output: buildWorkflowOutput(steps, stepOutputs),
        completed_at_epoch_ms: Date.now(),
      },
      { onlyIfStatus: "running" },
    );
    return;
  }

  const readySteps = getReadySteps(steps, completedStepNames, claimedStepNames);
  log.info(
    `executionCreated ${eid} — dispatching ${readySteps.length} ready step(s)`,
    {
      steps: readySteps.map((s) => s.name),
    },
  );

  await Promise.all(
    readySteps.map((step) =>
      dispatchStep(ctx, executionId, step, workflowInput, stepOutputs).catch(
        (error: Error) => {
          console.error(
            `[ORCHESTRATOR] Failed to dispatch step ${executionId}/${step.name}:`,
            error,
          );
        },
      ),
    ),
  );
  log.info(`executionCreated ${eid} — dispatch complete`);
}

/**
 * Handle workflow.step.execute event
 *
 * Claims the step, executes it, persists the result to DB,
 * and publishes a lightweight step.completed notification.
 */
export async function handleStepExecute(
  ctx: OrchestratorContext,
  executionId: string,
  stepName: string,
  iterationIndex?: number,
): Promise<void> {
  const log = new OrchestratorLog();
  const isIteration = iterationIndex !== undefined;
  const stepId = isIteration ? `${stepName}[${iterationIndex}]` : stepName;
  const eid = executionId.slice(0, 8);

  log.info(`stepExecute ${eid}/${stepId} — start`);

  // Get execution context (source of truth for inputs, step definitions, etc.)
  const context = await ctx.storage.getExecutionContext(executionId);
  if (!context || context.execution.status !== "running") {
    log.info(`stepExecute ${eid}/${stepId} — execution not running, skipping`);
    return;
  }

  const steps = context.workflow.steps;
  const step = steps.find((s) => s.name === stepName);
  if (!step) {
    log.info(`stepExecute ${eid}/${stepId} — step not found in workflow`);
    return;
  }

  // Claim step (creates record, returns null if already claimed)
  const claimed = await ctx.storage.createStepResult({
    execution_id: executionId,
    step_id: stepId,
  });
  if (!claimed) {
    log.info(`stepExecute ${eid}/${stepId} — already claimed, skipping`);
    return;
  }

  // Resolve input from DB (workflow input + completed step outputs)
  const workflowInput = context.workflow.input ?? {};
  const stepOutputs = buildStepOutputsMap(context.stepResults);

  let resolvedInput: Record<string, unknown>;
  if (isIteration && step.forEach?.ref) {
    // For forEach iterations, resolve the forEach ref to get the items array,
    // then pass items[iterationIndex] as the @item context
    const { resolved: forEachResolved } = resolveAllRefs(
      { items: step.forEach.ref },
      { workflowInput, stepOutputs },
    );
    const items = (forEachResolved as { items: unknown[] }).items;
    const item = Array.isArray(items) ? items[iterationIndex] : undefined;

    const { resolved } = resolveAllRefs(step.input, {
      workflowInput,
      stepOutputs,
      item,
      index: iterationIndex,
    });
    resolvedInput = resolved as Record<string, unknown>;
  } else {
    const { resolved } = resolveAllRefs(step.input, {
      workflowInput,
      stepOutputs,
    });
    resolvedInput = resolved as Record<string, unknown>;
  }

  // Execute the step
  const stepType = getStepType(step);
  let output: unknown;
  let error: string | undefined;

  log.info(`stepExecute ${eid}/${stepId} — running (${stepType})`);

  try {
    if (stepType === "tool") {
      const toolCtx: ToolStepContext = {
        virtualMcpId: context.workflow.virtual_mcp_id,
        createMCPProxy: ctx.createMCPProxy,
        storage: ctx.storage,
        executionId,
      };
      const result = await executeToolStep(toolCtx, step, resolvedInput);
      output = result.output;
      error = result.error;
    } else if (stepType === "code" && "code" in step.action) {
      const result = await executeCode(step.action.code, resolvedInput, stepId);
      output = result.output;
      error = result.error;
    } else {
      error = `Unknown step type for step ${stepName}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  log.info(
    `stepExecute ${eid}/${stepId} — done${error ? " (error)" : ""}, publishing step.completed`,
  );

  // Persist result to DB (source of truth)
  await ctx.storage.updateStepResult(executionId, stepId, {
    output,
    error,
    completed_at_epoch_ms: Date.now(),
  });

  // Publish lightweight notification (no output/error — handlers read from DB)
  await ctx.publish("workflow.step.completed", executionId, {
    stepName,
    iterationIndex,
  });

  log.info(`stepExecute ${eid}/${stepId} — step.completed published`);
}

/**
 * Handle workflow.step.completed event
 *
 * This is a notification-only handler. The step result (output/error) has
 * already been persisted to DB by the producer (handleStepExecute).
 * This handler reads the result from DB and orchestrates the next steps.
 */
export async function handleStepCompleted(
  ctx: OrchestratorContext,
  executionId: string,
  stepName: string,
  iterationIndex?: number,
): Promise<void> {
  const log = new OrchestratorLog();
  const isIteration = iterationIndex !== undefined;
  const stepId = isIteration ? `${stepName}[${iterationIndex}]` : stepName;
  const eid = executionId.slice(0, 8);

  // 1. Get execution context (includes the already-persisted step result)
  const context = await ctx.storage.getExecutionContext(executionId);
  if (!context) return;

  // Read the step result from DB (source of truth)
  const stepResult = context.stepResults.find((r) => r.step_id === stepId);
  const error = stepResult?.error ? String(stepResult.error) : undefined;

  log.info(`stepCompleted ${eid}/${stepId}${error ? " (error)" : ""}`);

  const isWorkflowRunning = context.execution.status === "running";
  const steps = context.workflow.steps;
  const workflowInput = context.workflow.input ?? {};

  // 2. Handle step error
  if (error && isWorkflowRunning) {
    const step = steps.find((s) => s.name === stepName);
    const onError: OnError = step?.config?.onError ?? "fail";
    const shouldContinue = await handleStepError(
      ctx,
      executionId,
      stepId,
      error,
      isIteration,
      onError,
    );
    if (!shouldContinue) return;
  }

  // 3. Handle forEach iteration completion
  if (isIteration) {
    const step = steps.find((s) => s.name === stepName);
    if (!step?.forEach) return;

    log.info(
      `stepCompleted ${eid}/${stepId} — forEach iteration, checking concurrency window`,
    );
    await handleForEachIterationCompletion(
      ctx,
      executionId,
      stepName,
      step,
      context.stepResults,
      workflowInput,
      isWorkflowRunning,
    );
    return;
  }

  // 4. Orchestrate next steps
  if (!isWorkflowRunning) return;

  // 4a. Check workflow-level deadline
  const deadlineAtEpochMs = context.execution.deadline_at_epoch_ms;
  if (deadlineAtEpochMs && Date.now() >= deadlineAtEpochMs) {
    log.info(`stepCompleted ${eid}/${stepId} — deadline exceeded, failing`);
    await ctx.storage.updateExecution(
      executionId,
      {
        status: "error",
        error: "Workflow execution exceeded its deadline",
        completed_at_epoch_ms: Date.now(),
      },
      { onlyIfStatus: "running" },
    );
    return;
  }

  const { completedStepNames, claimedStepNames, stepOutputs } =
    buildOrchestrationSets(context.stepResults);

  // 5. Check workflow completion
  if (completedStepNames.size === steps.length) {
    log.info(
      `stepCompleted ${eid}/${stepId} — all steps done, marking success`,
    );
    await ctx.storage.updateExecution(
      executionId,
      {
        status: "success",
        output: buildWorkflowOutput(steps, stepOutputs),
        completed_at_epoch_ms: Date.now(),
      },
      { onlyIfStatus: "running" },
    );
    return;
  }

  // 6. Dispatch ready steps
  log.info(`stepCompleted ${eid}/${stepId} — dispatching next ready steps`, {
    completed: completedStepNames.size,
    total: steps.length,
  });
  await dispatchReadySteps(
    ctx,
    executionId,
    steps,
    completedStepNames,
    claimedStepNames,
    workflowInput,
    stepOutputs,
  );
}

// ============================================================================
// Internal helpers
// ============================================================================

async function handleStepError(
  ctx: OrchestratorContext,
  executionId: string,
  stepId: string,
  error: string,
  isIteration: boolean,
  onError: OnError,
): Promise<boolean> {
  if (isIteration && onError === "continue") {
    return true;
  }

  await ctx.storage.updateExecution(
    executionId,
    {
      status: "error",
      error: `Step "${stepId}" failed: ${error}`,
      completed_at_epoch_ms: Date.now(),
    },
    { onlyIfStatus: "running" },
  );

  return isIteration;
}

async function handleForEachIterationCompletion(
  ctx: OrchestratorContext,
  executionId: string,
  stepName: string,
  step: Step,
  stepResults: ParsedStepResult[],
  workflowInput: Record<string, unknown>,
  isWorkflowRunning: boolean,
): Promise<void> {
  const log = new OrchestratorLog();
  const eid = executionId.slice(0, 8);
  const onError: OnError = step.config?.onError ?? "continue";
  const stepOutputs = buildStepOutputsMap(stepResults);

  // Resolve forEach ref to get total items
  const { resolved } = resolveAllRefs(
    { items: step.forEach!.ref },
    { workflowInput, stepOutputs },
  );
  const items = (resolved as { items: unknown[] }).items;

  if (!Array.isArray(items)) {
    console.error(
      `[ORCHESTRATOR] forEach ref did not resolve to array: ${step.forEach!.ref}`,
    );
    return;
  }

  const totalIterations = items.length;

  // Get all iteration results for this step
  const iterationResults = await ctx.storage.getStepResultsByPrefix(
    executionId,
    `${stepName}[`,
  );
  const completedIterations = iterationResults.filter(
    (r) => r.completed_at_epoch_ms,
  );
  const failedIterations = completedIterations.filter((r) => r.error);
  const successfulIterations = completedIterations.filter((r) => !r.error);

  log.info(
    `forEachCompletion ${eid}/${stepName} — ${completedIterations.length}/${totalIterations} done, ${iterationResults.length - completedIterations.length} in-flight`,
  );

  // Check if all iterations are complete
  if (completedIterations.length === totalIterations) {
    const success = successfulIterations.map((r) => r.output);
    const errors = failedIterations.map((r) => String(r.error));
    const parentError =
      onError === "fail" && errors.length > 0 ? errors.join(", ") : undefined;

    await ctx.storage.updateStepResult(executionId, stepName, {
      output: success,
      error: parentError,
      completed_at_epoch_ms: Date.now(),
    });

    // Continue with normal completion flow
    if (isWorkflowRunning) {
      // Re-fetch context after updating step result
      const freshContext = await ctx.storage.getExecutionContext(executionId);
      if (!freshContext || freshContext.execution.status !== "running") return;

      const {
        completedStepNames,
        claimedStepNames,
        stepOutputs: freshOutputs,
      } = buildOrchestrationSets(freshContext.stepResults);

      if (completedStepNames.size === freshContext.workflow.steps.length) {
        await ctx.storage.updateExecution(
          executionId,
          {
            status: "success",
            output: buildWorkflowOutput(
              freshContext.workflow.steps,
              freshOutputs,
            ),
            completed_at_epoch_ms: Date.now(),
          },
          { onlyIfStatus: "running" },
        );
        return;
      }

      await dispatchReadySteps(
        ctx,
        executionId,
        freshContext.workflow.steps,
        completedStepNames,
        claimedStepNames,
        workflowInput,
        freshOutputs,
      );
    }
    return;
  }

  // Dispatch next iterations to refill the concurrency window
  const concurrency = step.forEach!.concurrency ?? totalIterations;
  const inFlightCount = iterationResults.length - completedIterations.length;
  const nextIndex = iterationResults.length;
  const shouldContinue =
    isWorkflowRunning &&
    (onError === "continue" || failedIterations.length === 0);

  log.info(
    `forEachCompletion ${eid}/${stepName} — concurrency=${concurrency}, inFlight=${inFlightCount}, nextIndex=${nextIndex}, shouldContinue=${shouldContinue}`,
  );

  if (shouldContinue && inFlightCount < concurrency) {
    const slotsAvailable = concurrency - inFlightCount;
    const nextIndices: number[] = [];
    for (
      let i = nextIndex;
      i < totalIterations && nextIndices.length < slotsAvailable;
      i++
    ) {
      nextIndices.push(i);
    }
    if (nextIndices.length > 0) {
      log.info(
        `forEachCompletion ${eid}/${stepName} — refilling: dispatching ${nextIndices.length} more iteration(s)`,
        { indices: nextIndices },
      );
      await Promise.all(
        nextIndices.map((idx) =>
          ctx.publish("workflow.step.execute", executionId, {
            stepName,
            iterationIndex: idx,
          }),
        ),
      );
    } else {
      log.info(
        `forEachCompletion ${eid}/${stepName} — no more iterations to dispatch`,
      );
    }
  }
}

async function dispatchReadySteps(
  ctx: OrchestratorContext,
  executionId: string,
  steps: Step[],
  completedStepNames: Set<string>,
  claimedStepNames: Set<string>,
  workflowInput: Record<string, unknown>,
  stepOutputs: Map<string, unknown>,
): Promise<void> {
  const readySteps = getReadySteps(steps, completedStepNames, claimedStepNames);
  if (readySteps.length === 0) return;

  await Promise.all(
    readySteps.map((step) =>
      dispatchStep(ctx, executionId, step, workflowInput, stepOutputs),
    ),
  );
}

async function dispatchStep(
  ctx: OrchestratorContext,
  executionId: string,
  step: Step,
  workflowInput: Record<string, unknown>,
  stepOutputs: Map<string, unknown>,
): Promise<void> {
  const log = new OrchestratorLog();
  const eid = executionId.slice(0, 8);

  if (isForEachStep(step)) {
    // Resolve forEach ref to get items array
    const { resolved } = resolveAllRefs(
      { items: step.forEach!.ref },
      { workflowInput, stepOutputs },
    );
    const items = (resolved as { items: unknown[] }).items;

    if (!Array.isArray(items)) {
      await ctx.storage.createStepResult({
        execution_id: executionId,
        step_id: step.name,
        error: `forEach ref did not resolve to array: ${step.forEach!.ref}`,
        completed_at_epoch_ms: Date.now(),
      });
      return;
    }

    if (items.length === 0) {
      await ctx.storage.createStepResult({
        execution_id: executionId,
        step_id: step.name,
        output: [],
        completed_at_epoch_ms: Date.now(),
      });
      return;
    }

    // Claim parent step
    const parentClaimed = await ctx.storage.createStepResult({
      execution_id: executionId,
      step_id: step.name,
    });
    if (!parentClaimed) return;

    // Check for existing iteration results (recovery case: some iterations may already be done)
    const existingIterations = await ctx.storage.getStepResultsByPrefix(
      executionId,
      `${step.name}[`,
    );
    const completedIterationIndices = new Set<number>();
    for (const r of existingIterations) {
      if (r.completed_at_epoch_ms) {
        const match = r.step_id.match(/\[(\d+)\]$/);
        if (match) completedIterationIndices.add(Number(match[1]));
      }
    }

    // If all iterations are already completed (crash between iteration completion and parent finalization)
    if (completedIterationIndices.size === items.length) {
      const successResults = existingIterations
        .filter((r) => r.completed_at_epoch_ms && !r.error)
        .map((r) => r.output);
      const errorResults = existingIterations
        .filter((r) => r.completed_at_epoch_ms && r.error)
        .map((r) => String(r.error));
      const parentError =
        errorResults.length > 0 ? errorResults.join(", ") : undefined;

      await ctx.storage.updateStepResult(executionId, step.name, {
        output: successResults,
        error: parentError,
        completed_at_epoch_ms: Date.now(),
      });

      // Publish lightweight notification so the orchestrator can continue
      await ctx.publish("workflow.step.completed", executionId, {
        stepName: step.name,
      });
      return;
    }

    // Dispatch iterations that aren't already completed
    const concurrency = step.forEach!.concurrency ?? items.length;
    const pendingIndices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (!completedIterationIndices.has(i)) {
        pendingIndices.push(i);
      }
    }

    const initialBatch = pendingIndices.slice(0, concurrency);
    log.info(
      `dispatchStep ${eid}/${step.name} — forEach: ${items.length} items, concurrency=${concurrency}, dispatching batch of ${initialBatch.length}`,
      { indices: initialBatch },
    );

    await Promise.all(
      initialBatch.map((index) =>
        ctx.publish("workflow.step.execute", executionId, {
          stepName: step.name,
          iterationIndex: index,
        }),
      ),
    );
    log.info(`dispatchStep ${eid}/${step.name} — forEach batch published`);
  } else {
    // Regular step dispatch — notification only, handler resolves input from DB
    log.info(`dispatchStep ${eid}/${step.name} — regular step`);
    await ctx.publish("workflow.step.execute", executionId, {
      stepName: step.name,
    });
  }
}

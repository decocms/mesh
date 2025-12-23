/**
 * Workflows Well-Known Binding
 *
 * Defines the interface for workflow providers.
 * Any MCP that implements this binding can expose configurable workflows,
 * executions, step results, and events via collection bindings.
 *
 * This binding uses collection bindings for LIST and GET operations (read-only).
 */

import { z } from "zod";
import { type Binder, bindingClient, type ToolBinder } from "../core/binder";
import {
  BaseCollectionEntitySchema,
  createCollectionBindings,
} from "./collections";

export const ToolCallActionSchema = z.object({
  connectionId: z.string().describe("ID of the MCP connection to use"),
  toolName: z
    .string()
    .describe("Name of the tool to invoke on that connection"),
});
export type ToolCallAction = z.infer<typeof ToolCallActionSchema>;

export const CodeActionSchema = z.object({
  code: z
    .string()
    .describe(
      "Pure TypeScript function for data transformation. Must export a default async function: `export default async function(input: Input): Promise<Output> { ... }`",
    ),
});
export type CodeAction = z.infer<typeof CodeActionSchema>;

export const WaitForSignalActionSchema = z.object({
  signalName: z
    .string()
    .describe(
      "Signal name to wait for (e.g., 'approval'). Execution pauses until SEND_SIGNAL is called with this name.",
    ),
});
export type WaitForSignalAction = z.infer<typeof WaitForSignalActionSchema>;

export const StepActionSchema = z.union([
  ToolCallActionSchema.describe("Call an external tool via MCP connection"),
  CodeActionSchema.describe("Run pure TypeScript code for data transformation"),
  WaitForSignalActionSchema.describe(
    "Pause execution until an external signal is received (human-in-the-loop)",
  ),
]);
export type StepAction = z.infer<typeof StepActionSchema>;
/**
 * Condition Schema - Used for conditional step execution (if) and loop termination
 */
export const ConditionSchema = z.object({
  ref: z
    .string()
    .describe(
      "@ref path to evaluate, e.g., '@previousStep.success' or '@input.type'",
    ),
  operator: z
    .enum(["=", "!=", ">", ">=", "<", "<="])
    .default("=")
    .describe("Comparison operator (defaults to '=')"),
  value: z
    .unknown()
    .describe(
      "Value to compare against. Can be a literal (string, number, boolean) or a @ref.",
    ),
});
export type Condition = z.infer<typeof ConditionSchema>;

/**
 * Loop Config Schema - Run a step multiple times
 * Use 'for' to iterate over arrays, 'until'/'while' for condition-based loops
 */
export const LoopConfigSchema = z.object({
  for: z
    .object({
      items: z
        .string()
        .describe(
          "@ref to an array to iterate over, e.g., '@fetchData.results'",
        ),
      as: z
        .string()
        .default("item")
        .describe(
          "Variable name for current element (default: 'item', accessed as @item)",
        ),
    })
    .optional()
    .describe("Iterate over each element in an array"),
  until: z
    .object({
      path: z
        .string()
        .describe("@ref path to check after each iteration, e.g., '@complete'"),
      condition: z
        .enum(["=", "!=", ">", ">=", "<", "<=", "and", "or"])
        .optional(),
      value: z.string().describe("Stop looping when path equals this value"),
    })
    .optional()
    .describe("Repeat until condition becomes true"),
  while: z
    .object({
      path: z.string().describe("@ref path to check before each iteration"),
      condition: z.enum(["=", "!=", ">", ">=", "<", "<=", "and", "or"]),
      value: z.string().describe("Continue while path matches this value"),
    })
    .optional()
    .describe("Repeat while condition remains true"),
  limit: z
    .number()
    .optional()
    .describe("Max iterations (safety limit to prevent infinite loops)"),
  intervalMs: z
    .number()
    .optional()
    .describe("Delay between iterations in ms (useful for polling patterns)"),
});
export type LoopConfig = z.infer<typeof LoopConfigSchema>;

/**
 * Step Config Schema - Optional configuration for retry, timeout, and looping
 */
export const StepConfigSchema = z.object({
  maxAttempts: z
    .number()
    .optional()
    .describe("Max retry attempts on failure (default: 1, no retries)"),
  backoffMs: z
    .number()
    .optional()
    .describe("Initial delay between retries in ms (doubles each attempt)"),
  timeoutMs: z
    .number()
    .optional()
    .describe("Max execution time in ms before step fails (default: 30000)"),
  loop: LoopConfigSchema.optional().describe(
    "Run this step multiple times (iteration)",
  ),
});
export type StepConfig = z.infer<typeof StepConfigSchema>;

/**
 * Step Schema - A single unit of work in a workflow
 *
 * Action types:
 * - Tool call: Invoke an external tool via MCP connection
 * - Code: Run pure TypeScript for data transformation
 * - Wait for signal: Pause until external input (human-in-the-loop)
 *
 * Data flow uses @ref syntax:
 * - @input.field → workflow input
 * - @stepName.field → output from a previous step
 * - @item, @index → current element when looping (config.loop.for)
 */
export const StepSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Unique identifier for this step. Other steps reference its output as @name.field",
    ),
  description: z.string().optional().describe("What this step does"),
  action: StepActionSchema,
  input: z
    .record(z.unknown())
    .optional()
    .describe(
      "Data passed to the action. Use @ref for dynamic values: @input.field (workflow input), @stepName.field (previous step output), @item/@index (loop context). Example: { 'userId': '@input.user_id', 'data': '@fetch.result' }",
    ),
  outputSchema: z
    .record(z.unknown())
    .nullish()
    .describe(
      "Optional JSON Schema describing expected output (for validation/documentation)",
    ),
  config: StepConfigSchema.optional().describe(
    "Retry, timeout, and loop settings",
  ),
  if: ConditionSchema.optional().describe(
    "Skip this step unless condition is true. Steps depending on a skipped step are also skipped.",
  ),
});

export type Step = z.infer<typeof StepSchema>;

/**
 * Workflow Execution Status
 *
 * States:
 * - pending: Created but not started
 * - running: Currently executing
 * - completed: Successfully finished
 * - cancelled: Manually cancelled
 */

const WorkflowExecutionStatusEnum = z
  .enum(["enqueued", "running", "success", "error", "cancelled"])
  .default("enqueued");
export type WorkflowExecutionStatus = z.infer<
  typeof WorkflowExecutionStatusEnum
>;

/**
 * Workflow Execution Schema
 *
 * Includes lock columns and retry tracking.
 */
export const WorkflowExecutionSchema = BaseCollectionEntitySchema.extend({
  workflow_id: z.string(),
  status: WorkflowExecutionStatusEnum,
  input: z.record(z.unknown()).optional(),
  output: z.unknown(),
  steps: z
    .array(StepSchema)
    .describe("Steps that make up the workflow")
    .optional(),
  completed_at_epoch_ms: z.number().nullish(),
  start_at_epoch_ms: z.number().nullish(),
  timeout_ms: z.number().nullish(),
  deadline_at_epoch_ms: z.number().nullish(),
  error: z.unknown(),
});
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;

/**
 * Event Type Enum
 *
 * Event types for the unified events table:
 * - signal: External signal (human-in-the-loop)
 * - timer: Durable sleep wake-up
 * - message: Inter-workflow communication (send/recv)
 * - output: Published value (setEvent/getEvent)
 * - step_started: Observability - step began
 * - step_completed: Observability - step finished
 * - workflow_started: Workflow began execution
 * - workflow_completed: Workflow finished
 */
export const EventTypeEnum = z.enum([
  "signal",
  "timer",
  "message",
  "output",
  "step_started",
  "step_completed",
  "workflow_started",
  "workflow_completed",
]);

export type EventType = z.infer<typeof EventTypeEnum>;

/**
 * Workflow Event Schema
 *
 * Unified events table for signals, timers, messages, and observability.
 */
export const WorkflowEventSchema = BaseCollectionEntitySchema.extend({
  execution_id: z.string(),
  type: EventTypeEnum,
  name: z.string().nullish(),
  payload: z.unknown().optional(),
  visible_at: z.number().nullish(),
  consumed_at: z.number().nullish(),
  source_execution_id: z.string().nullish(),
});

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

/**
 * Workflow Schema - A sequence of steps that execute with data flowing between them
 *
 * Key concepts:
 * - Steps run in parallel unless they reference each other via @ref
 * - Use @ref to wire data: @input.field, @stepName.field, @item (in loops)
 * - Execution order is auto-determined from @ref dependencies
 *
 * Example: 2 parallel fetches + 1 merge step
 * {
 *   "title": "Fetch and Merge",
 *   "steps": [
 *     { "name": "fetch_users", "action": { "connectionId": "api", "toolName": "getUsers" } },
 *     { "name": "fetch_orders", "action": { "connectionId": "api", "toolName": "getOrders" } },
 *     { "name": "merge", "action": { "code": "..." }, "input": { "users": "@fetch_users.data", "orders": "@fetch_orders.data" } }
 *   ]
 * }
 * → fetch_users and fetch_orders run in parallel; merge waits for both
 */
export const WorkflowSchema = BaseCollectionEntitySchema.extend({
  description: z
    .string()
    .optional()
    .describe("Human-readable summary of what this workflow does"),

  steps: z
    .array(StepSchema)
    .describe(
      "Ordered list of steps. Execution order is auto-determined by @ref dependencies: steps with no @ref dependencies run in parallel; steps referencing @stepName wait for that step to complete.",
    ),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

/**
 * WORKFLOW Collection Binding
 *
 * Collection bindings for workflows (read-only).
 * Provides LIST and GET operations for workflows.
 */
export const WORKFLOWS_COLLECTION_BINDING = createCollectionBindings(
  "workflow",
  WorkflowSchema,
);

const DEFAULT_STEP_CONFIG: StepConfig = {
  maxAttempts: 1,
  timeoutMs: 30000,
};

export const DEFAULT_WAIT_FOR_SIGNAL_STEP: Omit<Step, "name"> = {
  action: {
    signalName: "approve_output",
  },
  outputSchema: {
    type: "object",
    properties: {
      approved: {
        type: "boolean",
        description: "Whether the output was approved",
      },
    },
  },
};
export const DEFAULT_TOOL_STEP: Omit<Step, "name"> = {
  action: {
    toolName: "",
    connectionId: "",
  },
  input: {},
  config: DEFAULT_STEP_CONFIG,
};
export const DEFAULT_CODE_STEP: Step = {
  name: "Initial Step",
  action: {
    code: `
  interface Input {
    example: string;
  }

  interface Output {
    result: unknown;
  }
    
  export default async function(input: Input): Promise<Output> { 
    return {
      result: input.example
    }
  }`,
  },
  config: DEFAULT_STEP_CONFIG,
};

export const createDefaultWorkflow = (id?: string): Workflow => ({
  id: id || crypto.randomUUID(),
  title: "Default Workflow",
  description: "The default workflow for the toolkit",
  steps: [DEFAULT_CODE_STEP],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const WORKFLOW_EXECUTIONS_COLLECTION_BINDING = createCollectionBindings(
  "workflow_execution",
  WorkflowExecutionSchema,
);

export const WORKFLOW_EVENTS_COLLECTION_BINDING = createCollectionBindings(
  "workflow_events",
  WorkflowEventSchema,
  {
    readOnly: true,
  },
);

/**
 * WORKFLOWS Binding
 *
 * Defines the interface for workflow providers.
 * Any MCP that implements this binding can provide configurable workflows.
 *
 * Required tools:
 * - COLLECTION_WORKFLOW_LIST: List available workflows with their configurations
 * - COLLECTION_WORKFLOW_GET: Get a single workflow by ID (includes steps and triggers)
 */
export const WORKFLOW_COLLECTIONS_BINDINGS = [
  ...WORKFLOWS_COLLECTION_BINDING,
  ...WORKFLOW_EXECUTIONS_COLLECTION_BINDING,
  ...WORKFLOW_EVENTS_COLLECTION_BINDING,
] as const satisfies Binder;

export const WORKFLOW_BINDING = [
  {
    name: "SEND_SIGNAL" as const,
    inputSchema: z.object({
      executionId: z.string().describe("The execution ID to send signal to"),
      signalName: z
        .string()
        .describe("Name of the signal (used by workflow to filter)"),
      payload: z
        .unknown()
        .optional()
        .describe("Optional data payload to send with the signal"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      signalId: z.string().optional(),
      message: z.string().optional(),
    }),
  },
  ...WORKFLOW_COLLECTIONS_BINDINGS,
] satisfies ToolBinder[];

export const WorkflowBinding = bindingClient(WORKFLOW_BINDING);

/**
 * DAG (Directed Acyclic Graph) utilities for workflow step execution
 *
 * Pure TypeScript functions for analyzing step dependencies and grouping
 * steps into execution levels for parallel execution.
 *
 * Can be used in both frontend (visualization) and backend (execution).
 */

/**
 * Minimal step interface for DAG computation.
 * This allows the DAG utilities to work with any step-like object.
 */
export interface DAGStep {
  name: string;
  input?: unknown;
  config?: {
    loop?: LoopConfig;
  };
  if?: Condition;
}

/**
 * Extract all @ref references from a value recursively.
 * Finds patterns like @stepName or @stepName.field
 *
 * @param input - Any value that might contain @ref strings
 * @returns Array of unique reference names (without @ prefix)
 */
export function getAllRefs(input: unknown): string[] {
  const refs: string[] = [];

  function traverse(value: unknown) {
    if (typeof value === "string") {
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        refs.push(...matches.map((m) => m.substring(1))); // Remove @ prefix
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(input);
  return [...new Set(refs)].sort(); // Dedupe and sort for consistent results
}

/**
 * Get the dependencies of a step (other steps it references).
 * Only returns dependencies that are actual step names (filters out built-ins like "item", "index", "input").
 *
 * @param step - The step to analyze
 * @param allStepNames - Set of all step names in the workflow
 * @returns Array of step names this step depends on
 */
export function getStepDependencies(
  step: DAGStep,
  allStepNames: Set<string>,
): string[] {
  const deps: string[] = [];

  function traverse(value: unknown) {
    if (typeof value === "string") {
      // Match @stepName or @stepName.something patterns
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        for (const match of matches) {
          const refName = match.substring(1); // Remove @
          // Only count as dependency if it references another step
          // (not "item", "index", "input" from forEach or workflow input)
          if (allStepNames.has(refName)) {
            deps.push(refName);
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(step.input);
  if (step.config?.loop?.for?.items) {
    traverse(step.config.loop.for.items);
  }

  // Also consider "if" condition as a dependency
  if (step.if) {
    traverse(step.if.ref);
    if (typeof step.if.value === "string") {
      traverse(step.if.value);
    }
  }

  return [...new Set(deps)];
}

/**
 * Build edges for the DAG: [fromStep, toStep][]
 */
export function buildDagEdges(steps: Step[]): [string, string][] {
  const stepNames = new Set(steps.map((s) => s.name));
  const edges: [string, string][] = [];

  for (const step of steps) {
    const deps = getStepDependencies(step, stepNames);
    for (const dep of deps) {
      edges.push([dep, step.name]);
    }
  }

  return edges;
}

/**
 * Compute topological levels for all steps.
 * Level 0 = no dependencies on other steps
 * Level N = depends on at least one step at level N-1
 *
 * @param steps - Array of steps to analyze
 * @returns Map from step name to level number
 */
export function computeStepLevels<T extends DAGStep>(
  steps: T[],
): Map<string, number> {
  const stepNames = new Set(steps.map((s) => s.name));
  const levels = new Map<string, number>();

  // Build dependency map
  const depsMap = new Map<string, string[]>();
  for (const step of steps) {
    depsMap.set(step.name, getStepDependencies(step, stepNames));
  }

  // Compute level for each step (with memoization)
  function getLevel(stepName: string, visited: Set<string>): number {
    if (levels.has(stepName)) return levels.get(stepName)!;
    if (visited.has(stepName)) return 0; // Cycle detection

    visited.add(stepName);
    const deps = depsMap.get(stepName) || [];

    if (deps.length === 0) {
      levels.set(stepName, 0);
      return 0;
    }

    const maxDepLevel = Math.max(...deps.map((d) => getLevel(d, visited)));
    const level = maxDepLevel + 1;
    levels.set(stepName, level);
    return level;
  }

  for (const step of steps) {
    getLevel(step.name, new Set());
  }

  return levels;
}

/**
 * Group steps by their execution level.
 * Steps at the same level have no dependencies on each other and can run in parallel.
 *
 * @param steps - Array of steps to group
 * @returns Array of step arrays, where index is the level
 */
export function groupStepsByLevel<T extends DAGStep>(steps: T[]): T[][] {
  const levels = computeStepLevels(steps);
  const maxLevel = Math.max(...Array.from(levels.values()), -1);

  const grouped: T[][] = [];
  for (let level = 0; level <= maxLevel; level++) {
    const stepsAtLevel = steps.filter((s) => levels.get(s.name) === level);
    if (stepsAtLevel.length > 0) {
      grouped.push(stepsAtLevel);
    }
  }

  return grouped;
}

/**
 * Get the dependency signature for a step (for grouping steps with same deps).
 *
 * @param step - The step to get signature for
 * @returns Comma-separated sorted list of dependencies
 */
export function getRefSignature(step: DAGStep): string {
  const inputRefs = getAllRefs(step.input);
  const forEachRefs = step.config?.loop?.for?.items
    ? getAllRefs(step.config.loop.for.items)
    : [];
  const allRefs = [...new Set([...inputRefs, ...forEachRefs])].sort();
  return allRefs.join(",");
}

/**
 * Build a dependency graph for visualization.
 * Returns edges as [fromStep, toStep] pairs.
 *
 * @param steps - Array of steps
 * @returns Array of [source, target] pairs representing edges
 */
export function buildDependencyEdges<T extends DAGStep>(
  steps: T[],
): [string, string][] {
  const stepNames = new Set(steps.map((s) => s.name));
  const edges: [string, string][] = [];

  for (const step of steps) {
    const deps = getStepDependencies(step, stepNames);
    for (const dep of deps) {
      edges.push([dep, step.name]);
    }
  }

  return edges;
}

/**
 * Validate that there are no cycles in the step dependencies.
 *
 * @param steps - Array of steps to validate
 * @returns Object with isValid and optional error message
 */
export function validateNoCycles<T extends DAGStep>(
  steps: T[],
): { isValid: boolean; error?: string } {
  const stepNames = new Set(steps.map((s) => s.name));
  const depsMap = new Map<string, string[]>();

  for (const step of steps) {
    depsMap.set(step.name, getStepDependencies(step, stepNames));
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(stepName: string, path: string[]): string[] | null {
    if (recursionStack.has(stepName)) {
      return [...path, stepName];
    }
    if (visited.has(stepName)) {
      return null;
    }

    visited.add(stepName);
    recursionStack.add(stepName);

    const deps = depsMap.get(stepName) || [];
    for (const dep of deps) {
      const cycle = hasCycle(dep, [...path, stepName]);
      if (cycle) return cycle;
    }

    recursionStack.delete(stepName);
    return null;
  }

  for (const step of steps) {
    const cycle = hasCycle(step.name, []);
    if (cycle) {
      return {
        isValid: false,
        error: `Circular dependency detected: ${cycle.join(" -> ")}`,
      };
    }
  }

  return { isValid: true };
}

// ============================================
// Branch Detection Utilities
// ============================================

/**
 * Get the step that a conditional step's "if" condition references.
 * Returns the step name from the @ref in the condition.
 *
 * @param step - The step with an if condition
 * @returns The step name referenced in the condition, or null if not found
 */
export function getConditionDependency(step: DAGStep): string | null {
  if (!step.if?.ref) return null;

  const match = step.if.ref.match(/@(\w+)/);
  return match?.[1] ?? null;
}

/**
 * Get all refs from a condition (both ref and value if value is a @ref)
 */
export function getConditionRefs(condition: Condition): string[] {
  const refs: string[] = [];

  // Get ref from the condition's ref field
  const refMatch = condition.ref.match(/@(\w+)/);
  if (refMatch?.[1]) {
    refs.push(refMatch[1]);
  }

  // Get ref from the value if it's a @ref string
  if (typeof condition.value === "string") {
    const valueMatch = condition.value.match(/@(\w+)/);
    if (valueMatch?.[1]) {
      refs.push(valueMatch[1]);
    }
  }

  return [...new Set(refs)];
}

/**
 * Determines which branch a step belongs to.
 * A step belongs to a branch if:
 * 1. It has an "if" condition (it's the branch root)
 * 2. It transitively depends on a step with an "if" condition
 *
 * @param steps - All steps in the workflow
 * @returns Map from step name to branch root step name (or null if not in a branch)
 */
export function computeBranchMembership<T extends DAGStep>(
  steps: T[],
): Map<string, string | null> {
  const stepNames = new Set(steps.map((s) => s.name));
  const stepMap = new Map(steps.map((s) => [s.name, s]));
  const branchMembership = new Map<string, string | null>();

  // Build dependency map
  const dependsOn = new Map<string, Set<string>>();
  for (const step of steps) {
    const deps = new Set<string>();

    // Add input dependencies
    const inputDeps = getStepDependencies(step, stepNames);
    for (const dep of inputDeps) {
      deps.add(dep);
    }

    // Add condition dependencies
    if (step.if) {
      const conditionRefs = getConditionRefs(step.if);
      for (const ref of conditionRefs) {
        if (stepNames.has(ref)) {
          deps.add(ref);
        }
      }
    }

    dependsOn.set(step.name, deps);
  }

  // Find branch root for each step (with memoization)
  function findBranchRoot(
    stepName: string,
    visited: Set<string>,
  ): string | null {
    if (branchMembership.has(stepName)) {
      return branchMembership.get(stepName) ?? null;
    }

    if (visited.has(stepName)) {
      return null; // Cycle detection
    }

    visited.add(stepName);
    const step = stepMap.get(stepName);
    if (!step) return null;

    // If this step has an "if" condition, it's a branch root
    if (step.if) {
      branchMembership.set(stepName, stepName);
      return stepName;
    }

    // Check if any dependency is in a branch
    const deps = dependsOn.get(stepName) || new Set();
    for (const dep of deps) {
      const depBranchRoot = findBranchRoot(dep, new Set(visited));
      if (depBranchRoot) {
        branchMembership.set(stepName, depBranchRoot);
        return depBranchRoot;
      }
    }

    branchMembership.set(stepName, null);
    return null;
  }

  // Compute branch membership for all steps
  for (const step of steps) {
    findBranchRoot(step.name, new Set());
  }

  return branchMembership;
}

/**
 * Get all steps that are branch roots (have an "if" condition)
 */
export function getBranchRoots<T extends DAGStep>(steps: T[]): T[] {
  return steps.filter((step) => step.if !== undefined);
}

/**
 * Get all steps that belong to a specific branch
 */
export function getStepsInBranch<T extends DAGStep>(
  steps: T[],
  branchRootName: string,
): T[] {
  const membership = computeBranchMembership(steps);
  return steps.filter((step) => membership.get(step.name) === branchRootName);
}

/**
 * Format a condition for display
 */
export function formatCondition(condition: Condition): string {
  const operator = condition.operator || "=";
  const valueStr =
    typeof condition.value === "string"
      ? condition.value
      : JSON.stringify(condition.value);
  return `${condition.ref} ${operator} ${valueStr}`;
}

/**
 * Get the terminal steps in the workflow.
 * A step is terminal if no other step depends on it (globally).
 *
 * This finds steps where you can safely add new steps after them
 * without breaking existing dependencies.
 *
 * @param steps - All steps in the workflow
 * @returns Array of step names that are terminal (no other step references them)
 */
export function getBranchTerminalSteps<T extends DAGStep>(
  steps: T[],
): string[] {
  if (steps.length === 0) return [];

  const stepNames = new Set(steps.map((s) => s.name));

  // Build a map of which steps depend on each step (reverse dependency)
  const dependedOnBy = new Map<string, Set<string>>();
  for (const step of steps) {
    dependedOnBy.set(step.name, new Set());
  }

  for (const step of steps) {
    const deps = getStepDependencies(step, stepNames);
    for (const dep of deps) {
      dependedOnBy.get(dep)?.add(step.name);
    }
  }

  // Terminal steps are those with no dependents (globally)
  const terminalSteps: string[] = [];
  for (const step of steps) {
    const dependents = dependedOnBy.get(step.name) ?? new Set();
    if (dependents.size === 0) {
      terminalSteps.push(step.name);
    }
  }

  // If no terminal steps found (shouldn't happen with valid workflows), return last step
  if (terminalSteps.length === 0 && steps.length > 0) {
    return [steps[steps.length - 1]?.name ?? ""]; // might cause a bug? check this out later @pedrofrxncx
  }

  return terminalSteps;
}

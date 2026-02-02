/**
 * Task Runner Well-Known Binding
 *
 * Defines the interface for task orchestration with Beads integration
 * and Ralph-style execution loops.
 *
 * This binding includes:
 * - WORKSPACE_SET/GET: Manage working directory
 * - BEADS_*: Task management via Beads CLI
 * - LOOP_*: Ralph-style execution loop control
 * - SKILL_*: Skill management and application
 */

import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

// ============================================================================
// Task Schema
// ============================================================================

const TaskSchema = z.object({
  id: z.string().describe("Task ID (e.g., bd-abc or bd-abc.1)"),
  title: z.string().describe("Task title"),
  description: z.string().optional(),
  status: z.enum(["open", "in_progress", "blocked", "closed"]).optional(),
  priority: z.number().optional(),
  issue_type: z.string().optional(),
  owner: z.string().optional(),
  created_at: z.string().optional(),
  created_by: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// ============================================================================
// Workspace Tools
// ============================================================================

const WorkspaceSetInputSchema = z.object({
  directory: z.string().describe("Absolute path to the workspace directory"),
});

const WorkspaceSetOutputSchema = z.object({
  success: z.boolean(),
  workspace: z.string(),
  hasBeads: z.boolean().describe("Whether .beads/ directory exists"),
});

const WorkspaceGetInputSchema = z.object({});

const WorkspaceGetOutputSchema = z.object({
  workspace: z.string().nullable(),
  hasBeads: z.boolean().nullable().describe("Whether .beads/ directory exists"),
});

// ============================================================================
// Beads Tools
// ============================================================================

const BeadsInitInputSchema = z.object({
  prefix: z.string().optional().describe("Custom prefix for task IDs"),
  quiet: z.boolean().optional(),
});

const BeadsInitOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  workspace: z.string(),
});

const BeadsReadyInputSchema = z.object({
  limit: z.number().optional(),
});

const BeadsReadyOutputSchema = z.object({
  tasks: z.array(TaskSchema),
  count: z.number(),
});

const BeadsCreateInputSchema = z.object({
  title: z.string(),
  type: z.enum(["epic", "story", "task", "bug"]).optional(),
  priority: z.number().optional(),
  description: z.string().optional(),
  epic: z.string().optional(),
  blockedBy: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
});

const BeadsCreateOutputSchema = z.object({
  success: z.boolean(),
  taskId: z.string(),
  message: z.string(),
});

const BeadsUpdateInputSchema = z.object({
  taskId: z.string(),
  status: z.enum(["open", "in_progress", "blocked", "closed"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().optional(),
  notes: z.string().optional(),
});

const BeadsUpdateOutputSchema = z.object({
  success: z.boolean(),
  taskId: z.string(),
  message: z.string(),
});

const BeadsCloseInputSchema = z.object({
  taskIds: z.array(z.string()).min(1),
  reason: z.string().optional(),
});

const BeadsCloseOutputSchema = z.object({
  success: z.boolean(),
  closedTasks: z.array(z.string()),
  message: z.string(),
});

const BeadsListInputSchema = z.object({
  tree: z.boolean().optional(),
  status: z.enum(["open", "in_progress", "blocked", "closed"]).optional(),
  epic: z.string().optional(),
});

const BeadsListOutputSchema = z.object({
  tasks: z.array(TaskSchema),
  count: z.number(),
});

// ============================================================================
// Loop Tools
// ============================================================================

const LoopStartInputSchema = z.object({
  maxIterations: z.number().optional(),
  maxTokens: z.number().optional(),
  qualityGates: z.array(z.string()).optional(),
  singleIteration: z.boolean().optional(),
});

const LoopStartOutputSchema = z.object({
  status: z.string(),
  iterations: z.number(),
  tasksCompleted: z.array(z.string()),
  tasksFailed: z.array(z.string()),
  totalTokens: z.number(),
  message: z.string(),
});

const LoopStatusInputSchema = z.object({});

const LoopStatusOutputSchema = z.object({
  status: z.string(),
  currentTask: z.string().nullable(),
  iteration: z.number(),
  maxIterations: z.number(),
  totalTokens: z.number(),
  maxTokens: z.number(),
  tasksCompleted: z.array(z.string()),
  tasksFailed: z.array(z.string()),
  startedAt: z.string().nullable(),
  lastActivity: z.string().nullable(),
  error: z.string().nullable(),
});

const LoopPauseInputSchema = z.object({});
const LoopPauseOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const LoopStopInputSchema = z.object({});
const LoopStopOutputSchema = z.object({
  success: z.boolean(),
  finalState: z.object({
    iterations: z.number(),
    tasksCompleted: z.array(z.string()),
    tasksFailed: z.array(z.string()),
  }),
});

// ============================================================================
// Skill Tools
// ============================================================================

const SkillSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  stack: z.array(z.string()),
  storyCount: z.number(),
});

const SkillListInputSchema = z.object({});
const SkillListOutputSchema = z.object({
  skills: z.array(SkillSummarySchema),
});

const SkillApplyInputSchema = z.object({
  skillId: z.string(),
  customization: z
    .object({
      prefix: z.string().optional(),
      extraContext: z.string().optional(),
    })
    .optional(),
});

const SkillApplyOutputSchema = z.object({
  success: z.boolean(),
  tasksCreated: z.array(z.string()),
  message: z.string(),
});

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Task Runner Binding
 *
 * Defines the interface for task orchestration with Beads and Ralph loop.
 */
export const TASK_RUNNER_BINDING = [
  {
    name: "WORKSPACE_SET" as const,
    inputSchema: WorkspaceSetInputSchema,
    outputSchema: WorkspaceSetOutputSchema,
  } satisfies ToolBinder<
    "WORKSPACE_SET",
    z.infer<typeof WorkspaceSetInputSchema>,
    z.infer<typeof WorkspaceSetOutputSchema>
  >,
  {
    name: "WORKSPACE_GET" as const,
    inputSchema: WorkspaceGetInputSchema,
    outputSchema: WorkspaceGetOutputSchema,
  } satisfies ToolBinder<
    "WORKSPACE_GET",
    z.infer<typeof WorkspaceGetInputSchema>,
    z.infer<typeof WorkspaceGetOutputSchema>
  >,
  {
    name: "BEADS_INIT" as const,
    inputSchema: BeadsInitInputSchema,
    outputSchema: BeadsInitOutputSchema,
  } satisfies ToolBinder<
    "BEADS_INIT",
    z.infer<typeof BeadsInitInputSchema>,
    z.infer<typeof BeadsInitOutputSchema>
  >,
  {
    name: "BEADS_READY" as const,
    inputSchema: BeadsReadyInputSchema,
    outputSchema: BeadsReadyOutputSchema,
  } satisfies ToolBinder<
    "BEADS_READY",
    z.infer<typeof BeadsReadyInputSchema>,
    z.infer<typeof BeadsReadyOutputSchema>
  >,
  {
    name: "BEADS_CREATE" as const,
    inputSchema: BeadsCreateInputSchema,
    outputSchema: BeadsCreateOutputSchema,
  } satisfies ToolBinder<
    "BEADS_CREATE",
    z.infer<typeof BeadsCreateInputSchema>,
    z.infer<typeof BeadsCreateOutputSchema>
  >,
  {
    name: "BEADS_UPDATE" as const,
    inputSchema: BeadsUpdateInputSchema,
    outputSchema: BeadsUpdateOutputSchema,
  } satisfies ToolBinder<
    "BEADS_UPDATE",
    z.infer<typeof BeadsUpdateInputSchema>,
    z.infer<typeof BeadsUpdateOutputSchema>
  >,
  {
    name: "BEADS_CLOSE" as const,
    inputSchema: BeadsCloseInputSchema,
    outputSchema: BeadsCloseOutputSchema,
  } satisfies ToolBinder<
    "BEADS_CLOSE",
    z.infer<typeof BeadsCloseInputSchema>,
    z.infer<typeof BeadsCloseOutputSchema>
  >,
  {
    name: "BEADS_LIST" as const,
    inputSchema: BeadsListInputSchema,
    outputSchema: BeadsListOutputSchema,
  } satisfies ToolBinder<
    "BEADS_LIST",
    z.infer<typeof BeadsListInputSchema>,
    z.infer<typeof BeadsListOutputSchema>
  >,
  {
    name: "LOOP_START" as const,
    inputSchema: LoopStartInputSchema,
    outputSchema: LoopStartOutputSchema,
  } satisfies ToolBinder<
    "LOOP_START",
    z.infer<typeof LoopStartInputSchema>,
    z.infer<typeof LoopStartOutputSchema>
  >,
  {
    name: "LOOP_STATUS" as const,
    inputSchema: LoopStatusInputSchema,
    outputSchema: LoopStatusOutputSchema,
  } satisfies ToolBinder<
    "LOOP_STATUS",
    z.infer<typeof LoopStatusInputSchema>,
    z.infer<typeof LoopStatusOutputSchema>
  >,
  {
    name: "LOOP_PAUSE" as const,
    inputSchema: LoopPauseInputSchema,
    outputSchema: LoopPauseOutputSchema,
  } satisfies ToolBinder<
    "LOOP_PAUSE",
    z.infer<typeof LoopPauseInputSchema>,
    z.infer<typeof LoopPauseOutputSchema>
  >,
  {
    name: "LOOP_STOP" as const,
    inputSchema: LoopStopInputSchema,
    outputSchema: LoopStopOutputSchema,
  } satisfies ToolBinder<
    "LOOP_STOP",
    z.infer<typeof LoopStopInputSchema>,
    z.infer<typeof LoopStopOutputSchema>
  >,
  {
    name: "SKILL_LIST" as const,
    inputSchema: SkillListInputSchema,
    outputSchema: SkillListOutputSchema,
  } satisfies ToolBinder<
    "SKILL_LIST",
    z.infer<typeof SkillListInputSchema>,
    z.infer<typeof SkillListOutputSchema>
  >,
  {
    name: "SKILL_APPLY" as const,
    inputSchema: SkillApplyInputSchema,
    outputSchema: SkillApplyOutputSchema,
  } satisfies ToolBinder<
    "SKILL_APPLY",
    z.infer<typeof SkillApplyInputSchema>,
    z.infer<typeof SkillApplyOutputSchema>
  >,
] as const satisfies Binder;

export type TaskRunnerBinding = typeof TASK_RUNNER_BINDING;

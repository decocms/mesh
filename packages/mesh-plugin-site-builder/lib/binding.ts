/**
 * Site Builder Binding
 *
 * Extends OBJECT_STORAGE_BINDING to inherit file operations.
 * Site detection is done via runtime file checks (deno.json with deco imports),
 * not via additional binding requirements.
 *
 * Also includes optional EXEC/DENO_TASK tools for dev server management.
 */

import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import type { Binder, ToolBinder } from "@decocms/bindings";
import { z } from "zod";

// DENO_TASK tool for running deno tasks
const DenoTaskInputSchema = z.object({
  task: z.string().describe("The task name (e.g., 'start', 'build', 'dev')"),
  background: z
    .boolean()
    .optional()
    .default(false)
    .describe("Run in background (for dev servers)"),
});

const DenoTaskOutputSchema = z.object({
  success: z.boolean(),
  task: z.string(),
  background: z.boolean().optional(),
  pid: z.number().optional(),
  exitCode: z.number().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Site Builder uses object storage binding plus optional DENO_TASK.
 * Connection filtering for "site" detection happens at runtime
 * by checking for deno.json with deco/ imports.
 */
export const SITE_BUILDER_BINDING = [
  ...OBJECT_STORAGE_BINDING,
  {
    name: "DENO_TASK" as const,
    inputSchema: DenoTaskInputSchema,
    outputSchema: DenoTaskOutputSchema,
  } satisfies ToolBinder<
    "DENO_TASK",
    z.infer<typeof DenoTaskInputSchema>,
    z.infer<typeof DenoTaskOutputSchema>
  >,
] as const satisfies Binder;

export type SiteBuilderBinding = typeof SITE_BUILDER_BINDING;

import { z } from "zod";
import { RegistryItemSchema } from "./schema";

export const TestModeSchema = z.enum([
  "health_check",
  "tool_call",
  "full_agent",
]);
export const TestFailureActionSchema = z.enum([
  "none",
  "remove_public",
  "remove_private",
  "remove_all",
]);
export const TestRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const TestResultStatusSchema = z.enum([
  "passed",
  "failed",
  "skipped",
  "error",
  "needs_auth",
]);
export const TestConnectionAuthStatusSchema = z.enum([
  "none",
  "needs_auth",
  "authenticated",
]);

export const RegistryTestConfigSchema = z.object({
  testMode: TestModeSchema.default("health_check"),
  onFailure: TestFailureActionSchema.default("none"),
  agentPrompt: z.string().optional().default(""),
  schedule: z.enum(["manual", "cron"]).default("manual"),
  cronExpression: z.string().optional(),
  perMcpTimeoutMs: z.number().int().min(1000).max(600_000).default(30_000),
  perToolTimeoutMs: z.number().int().min(500).max(120_000).default(10_000),
  testPublicOnly: z.boolean().default(false),
  testPrivateOnly: z.boolean().default(false),
  llmConnectionId: z.string().optional(),
  llmModelId: z.string().optional(),
});

export const TestToolResultSchema = z.object({
  toolName: z.string(),
  success: z.boolean(),
  durationMs: z.number(),
  input: z.record(z.string(), z.unknown()).optional(),
  outputPreview: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export const TestRunSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  status: TestRunStatusSchema,
  config_snapshot: RegistryTestConfigSchema.nullable(),
  total_items: z.number(),
  tested_items: z.number(),
  passed_items: z.number(),
  failed_items: z.number(),
  skipped_items: z.number(),
  current_item_id: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  created_at: z.string(),
});

export const TestResultSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  organization_id: z.string(),
  item_id: z.string(),
  item_title: z.string(),
  status: TestResultStatusSchema,
  error_message: z.string().nullable(),
  connection_ok: z.boolean(),
  tools_listed: z.boolean(),
  tool_results: z.array(TestToolResultSchema),
  agent_summary: z.string().nullable(),
  duration_ms: z.number(),
  action_taken: z.string(),
  tested_at: z.string(),
});

export const TestConnectionSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  item_id: z.string(),
  connection_id: z.string(),
  auth_status: TestConnectionAuthStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const RegistryTestRunStartInputSchema = z
  .object({
    config: RegistryTestConfigSchema.optional(),
  })
  .default({});

export const RegistryTestRunStartOutputSchema = z.object({
  run: TestRunSchema,
});

export const RegistryTestRunCancelInputSchema = z.object({
  runId: z.string(),
});

export const RegistryTestRunCancelOutputSchema = z.object({
  run: TestRunSchema,
});

export const RegistryTestRunListInputSchema = z.object({
  status: TestRunStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const RegistryTestRunListOutputSchema = z.object({
  items: z.array(TestRunSchema),
  totalCount: z.number(),
});

export const RegistryTestRunGetInputSchema = z.object({
  runId: z.string(),
});

export const RegistryTestRunGetOutputSchema = z.object({
  run: TestRunSchema.nullable(),
});

export const RegistryTestResultListInputSchema = z.object({
  runId: z.string(),
  status: TestResultStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const RegistryTestResultListOutputSchema = z.object({
  items: z.array(TestResultSchema),
  totalCount: z.number(),
});

export const RegistryTestConnectionListInputSchema = z.object({});

export const RegistryTestConnectionListOutputSchema = z.object({
  items: z.array(
    z.object({
      mapping: TestConnectionSchema,
      item: RegistryItemSchema.nullable(),
      remoteUrl: z.string().nullable(),
    }),
  ),
});

export const RegistryTestConnectionSyncInputSchema = z.object({});

export const RegistryTestConnectionSyncOutputSchema = z.object({
  created: z.number(),
  updated: z.number(),
});

export const RegistryTestConnectionUpdateAuthInputSchema = z.object({
  connectionId: z
    .string()
    .describe("The test connection ID (connections table)"),
  authStatus: TestConnectionAuthStatusSchema.describe("New auth status"),
});

export const RegistryTestConnectionUpdateAuthOutputSchema = z.object({
  success: z.boolean(),
});

export type RegistryTestConfig = z.infer<typeof RegistryTestConfigSchema>;

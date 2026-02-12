/**
 * Reports Well-Known Binding
 *
 * Defines the interface for viewing automated reports with actionable insights.
 * Any MCP that implements this binding can provide reports to the Reports plugin
 * (e.g. performance audits, security scans, accessibility checks).
 *
 * This binding includes:
 * - REPORTS_LIST: List all available reports with metadata
 * - REPORTS_GET: Get a specific report with full content
 * - REPORTS_EXECUTE_ACTION: Execute an actionable item from a report
 */

import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

// ============================================================================
// Shared Schemas
// ============================================================================

/**
 * Report status indicates the overall health/outcome of the report.
 */
export const ReportStatusSchema = z.enum([
  "passing",
  "warning",
  "failing",
  "info",
]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/**
 * A single metric item within a metrics section.
 */
export const MetricItemSchema = z.object({
  label: z.string().describe("Metric label (e.g. 'LCP', 'Performance')"),
  value: z.union([z.number(), z.string()]).describe("Current metric value"),
  unit: z
    .string()
    .optional()
    .describe("Unit of measurement (e.g. 's', 'ms', 'score')"),
  previousValue: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Previous value for delta comparison"),
  status: ReportStatusSchema.optional().describe(
    "Status of this individual metric",
  ),
});
export type MetricItem = z.infer<typeof MetricItemSchema>;

/**
 * Report sections -- polymorphic by type.
 * Sections represent the main content blocks of a report.
 */
export const ReportSectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("markdown"),
    content: z.string().describe("Markdown content"),
  }),
  z.object({
    type: z.literal("metrics"),
    title: z.string().optional().describe("Section title"),
    items: z.array(MetricItemSchema).describe("Metric items"),
  }),
  z.object({
    type: z.literal("table"),
    title: z.string().optional().describe("Section title"),
    columns: z.array(z.string()).describe("Column headers"),
    rows: z
      .array(z.array(z.union([z.string(), z.number(), z.null()])))
      .describe("Table rows"),
  }),
]);
export type ReportSection = z.infer<typeof ReportSectionSchema>;

/**
 * An actionable item attached to a report.
 */
export const ReportActionSchema = z.object({
  id: z.string().describe("Unique action identifier within the report"),
  label: z.string().describe("Display label for the action"),
  description: z
    .string()
    .optional()
    .describe("Longer description of what the action does"),
  type: z
    .enum(["create-pr", "create-issue", "run-command", "link"])
    .describe("Action type"),
  status: z
    .enum(["pending", "completed", "failed", "in-progress"])
    .optional()
    .describe("Current execution status"),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Action-specific parameters"),
});
export type ReportAction = z.infer<typeof ReportActionSchema>;

/**
 * Summary of a report returned by REPORTS_LIST.
 */
export const ReportSummarySchema = z.object({
  id: z.string().describe("Unique report identifier"),
  title: z.string().describe("Report title"),
  category: z
    .string()
    .describe(
      "Report category (e.g. 'performance', 'security', 'accessibility')",
    ),
  status: ReportStatusSchema.describe("Overall report status"),
  summary: z.string().describe("One-line summary of findings"),
  updatedAt: z.string().describe("ISO 8601 timestamp of last update"),
  source: z
    .string()
    .optional()
    .describe(
      "Source tool or service (e.g. 'pagespeed-insights', 'npm-audit')",
    ),
  actionCount: z.number().describe("Number of available actionable items"),
  read: z
    .boolean()
    .optional()
    .describe("Whether this report has been viewed by the user"),
  dismissed: z
    .boolean()
    .optional()
    .describe("Whether this report has been dismissed/completed"),
});
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

/**
 * Full report returned by REPORTS_GET.
 */
export const ReportSchema = ReportSummarySchema.extend({
  sections: z.array(ReportSectionSchema).describe("Ordered content sections"),
  actions: z.array(ReportActionSchema).describe("Actionable items"),
});
export type Report = z.infer<typeof ReportSchema>;

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * REPORTS_LIST - List all available reports with optional filters
 */
const ReportsListInputSchema = z.object({
  category: z
    .string()
    .optional()
    .describe("Filter by category (e.g. 'performance', 'security')"),
  status: ReportStatusSchema.optional().describe("Filter by report status"),
});

const ReportsListOutputSchema = z.object({
  reports: z.array(ReportSummarySchema).describe("List of report summaries"),
});

export type ReportsListInput = z.infer<typeof ReportsListInputSchema>;
export type ReportsListOutput = z.infer<typeof ReportsListOutputSchema>;

/**
 * REPORTS_GET - Get a specific report with full content
 */
const ReportsGetInputSchema = z.object({
  id: z.string().describe("Report identifier"),
});

const ReportsGetOutputSchema = ReportSchema;

export type ReportsGetInput = z.infer<typeof ReportsGetInputSchema>;
export type ReportsGetOutput = z.infer<typeof ReportsGetOutputSchema>;

/**
 * REPORTS_EXECUTE_ACTION - Execute an actionable item from a report
 */
const ReportsExecuteActionInputSchema = z.object({
  reportId: z.string().describe("Report identifier"),
  actionId: z.string().describe("Action identifier within the report"),
});

const ReportsExecuteActionOutputSchema = z.object({
  success: z.boolean().describe("Whether the action was executed successfully"),
  message: z.string().optional().describe("Human-readable result message"),
  url: z
    .string()
    .optional()
    .describe("URL of the created resource (e.g. PR URL, issue URL)"),
});

export type ReportsExecuteActionInput = z.infer<
  typeof ReportsExecuteActionInputSchema
>;
export type ReportsExecuteActionOutput = z.infer<
  typeof ReportsExecuteActionOutputSchema
>;

/**
 * REPORTS_MARK_READ - Mark a report as read/unread (optional tool)
 */
const ReportsMarkReadInputSchema = z.object({
  reportId: z.string().describe("Report identifier"),
  read: z
    .boolean()
    .describe("Whether to mark as read (true) or unread (false)"),
});

const ReportsMarkReadOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
});

export type ReportsMarkReadInput = z.infer<typeof ReportsMarkReadInputSchema>;
export type ReportsMarkReadOutput = z.infer<typeof ReportsMarkReadOutputSchema>;

/**
 * REPORTS_DISMISS - Dismiss/un-dismiss a report (optional tool)
 */
const ReportsDismissInputSchema = z.object({
  reportId: z.string().describe("Report identifier"),
  dismissed: z
    .boolean()
    .describe("Whether to dismiss (true) or restore (false)"),
});

const ReportsDismissOutputSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  message: z.string().optional().describe("Human-readable result message"),
});

export type ReportsDismissInput = z.infer<typeof ReportsDismissInputSchema>;
export type ReportsDismissOutput = z.infer<typeof ReportsDismissOutputSchema>;

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Reports Binding
 *
 * Defines the interface for viewing automated reports with actionable insights.
 * Any MCP that implements this binding can be used with the Reports plugin.
 *
 * Required tools:
 * - REPORTS_LIST: List available reports with optional filtering
 * - REPORTS_GET: Get a single report with full content and actions
 * - REPORTS_EXECUTE_ACTION: Execute an actionable item (e.g. create a PR)
 *
 * Optional tools:
 * - REPORTS_MARK_READ: Mark a report as read/unread
 * - REPORTS_DISMISS: Dismiss or restore a report
 */
export const REPORTS_BINDING = [
  {
    name: "REPORTS_LIST" as const,
    inputSchema: ReportsListInputSchema,
    outputSchema: ReportsListOutputSchema,
  } satisfies ToolBinder<"REPORTS_LIST", ReportsListInput, ReportsListOutput>,
  {
    name: "REPORTS_GET" as const,
    inputSchema: ReportsGetInputSchema,
    outputSchema: ReportsGetOutputSchema,
  } satisfies ToolBinder<"REPORTS_GET", ReportsGetInput, ReportsGetOutput>,
  {
    name: "REPORTS_EXECUTE_ACTION" as const,
    inputSchema: ReportsExecuteActionInputSchema,
    outputSchema: ReportsExecuteActionOutputSchema,
  } satisfies ToolBinder<
    "REPORTS_EXECUTE_ACTION",
    ReportsExecuteActionInput,
    ReportsExecuteActionOutput
  >,
  {
    name: "REPORTS_MARK_READ" as const,
    inputSchema: ReportsMarkReadInputSchema,
    outputSchema: ReportsMarkReadOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "REPORTS_MARK_READ",
    ReportsMarkReadInput,
    ReportsMarkReadOutput
  >,
  {
    name: "REPORTS_DISMISS" as const,
    inputSchema: ReportsDismissInputSchema,
    outputSchema: ReportsDismissOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "REPORTS_DISMISS",
    ReportsDismissInput,
    ReportsDismissOutput
  >,
] as const satisfies Binder;

export type ReportsBinding = typeof REPORTS_BINDING;

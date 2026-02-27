import type { ReportSection } from "@decocms/bindings";

/**
 * Context passed to step input builders.
 */
export interface StepContext {
  url: string;
  sessionId: string;
  /** Previously completed step outputs keyed by step id */
  outputs: Record<string, unknown>;
}

/**
 * Definition of a single research step.
 */
export interface ResearchStep {
  /** Unique step identifier, e.g. "crawl" */
  id: string;
  /** Human-readable label shown in the UI */
  label: string;
  /** MCP tool name to call on the Virtual MCP */
  toolName: string;
  /** Build tool input from the current context */
  buildInput: (ctx: StepContext) => Record<string, unknown>;
  /** Filename for persisting the output, e.g. "crawl.json" */
  outputFile: string;
  /** Step IDs whose output files must exist before this step runs */
  dependsOn?: string[];
  /** If true, failure doesn't block subsequent steps */
  optional?: boolean;
}

/**
 * Status of a research step during execution.
 */
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

/**
 * Runtime state for a step.
 */
export interface StepState {
  id: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  /** Brief summary extracted from the output for display */
  preview?: string;
}

/**
 * Metadata stored in meta.json for each session.
 */
export interface SessionMeta {
  url: string;
  sessionId: string;
  startedAt: string;
  status: "running" | "completed" | "failed";
}

/**
 * Agent suggestion placed after a report section.
 */
export interface AgentSuggestion {
  /** Index of the section this CTA should appear after */
  afterSectionIndex: number;
  agentId: string;
  agentName: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

/**
 * The unified report stored in report.json.
 */
export interface SiteResearchReport {
  url: string;
  analyzedAt: string;
  overallScore: number;
  sections: ReportSection[];
  agentSuggestions: AgentSuggestion[];
}

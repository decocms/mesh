/**
 * Diagnostic System Types
 *
 * Shared TypeScript types for the entire diagnostic system.
 * These types are used across the diagnostic pipeline, storage, and API.
 */

import type { WebPerformanceResult } from "./agents/web-performance";
import type { SeoResult } from "./agents/seo";
import type { TechStackResult } from "./agents/tech-stack";
import type { CompanyContextResult } from "./agents/company-context";

/** Re-export agent result types — single source of truth lives in the agent files */
export type {
  WebPerformanceResult,
  SeoResult,
  TechStackResult,
  CompanyContextResult,
};

// ============================================================================
// Agent Identifiers
// ============================================================================

/** One identifier per diagnostic agent */
export type DiagnosticAgentId =
  | "web_performance"
  | "seo"
  | "tech_stack"
  | "company_context";

// ============================================================================
// Status Types
// ============================================================================

/** Per-agent status tracking for progressive updates */
export interface AgentStatus {
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: string; // ISO 8601
  completedAt?: string;
  error?: string; // Only set on failure — NOT exposed differently from "no data"
}

/** Overall session status */
export type SessionStatus = "pending" | "running" | "completed" | "failed";

// ============================================================================
// Diagnostic Result Types
// ============================================================================

/** Complete diagnostic result set */
export interface DiagnosticResult {
  webPerformance?: WebPerformanceResult | null;
  seo?: SeoResult | null;
  techStack?: TechStackResult | null;
  companyContext?: CompanyContextResult | null;
  interviewResults?: InterviewResults | null;
}

// ============================================================================
// Interview + Recommendation Types
// ============================================================================

/** Interview results persisted after onboarding chat */
export interface InterviewResults {
  goals: string[];
  challenges: string[];
  priorities: string[];
}

/** A single agent recommendation with explanation */
export interface AgentRecommendation {
  /** Virtual MCP ID */
  agentId: string;
  /** Virtual MCP title */
  agentTitle: string;
  /** Virtual MCP description */
  agentDescription: string | null;
  /** Virtual MCP icon */
  agentIcon: string | null;
  /** Plain-English explanation of why this agent was recommended */
  reason: string;
  /** Relevance score (0-100) — used for ordering, not displayed */
  score: number;
  /** Connection types/names this agent needs to function */
  requiredConnections: Array<{
    /** Connection title from the Virtual MCP's connections list */
    title: string;
    /** Connection ID */
    connectionId: string;
    /** Whether this connection is already configured */
    isConfigured: boolean;
  }>;
}

// ============================================================================
// Session Type
// ============================================================================

/** Session as stored in DB (JSON columns for agents and results) */
export interface DiagnosticSession {
  id: string;
  token: string;
  url: string;
  normalizedUrl: string;
  status: SessionStatus;
  agents: Record<DiagnosticAgentId, AgentStatus>;
  results: DiagnosticResult;
  organizationId: string | null; // Nullable — filled post-login (Phase 21)
  projectId: string | null; // Nullable — filled post-login
  createdAt: string;
  updatedAt: string;
  expiresAt: string; // 7 days from creation
}

/**
 * Diagnostic Orchestrator
 *
 * Coordinates parallel execution of all 4 diagnostic agents with progressive
 * status updates. The public scan endpoint calls runDiagnostic() which returns
 * a session token immediately — agents run in the background (fire-and-forget).
 *
 * Lifecycle:
 *   1. Validate URL (SSRF guard)
 *   2. Check 24-hour result cache
 *   3. Create session (status: "pending")
 *   4. Return token immediately to caller
 *   5. Background: crawl homepage, run 4 agents in parallel, update status
 *   6. Background: set session status to "completed" when all agents settle
 */

import { crawlPage } from "./crawl";
import type { CrawlResult } from "./crawl";
import type { DiagnosticAgentId } from "./types";
import { validateUrl } from "./ssrf-validator";
import type { DiagnosticSessionStorage } from "../storage/diagnostic-sessions";
import {
  runCompanyContextAgent,
  runSeoAgent,
  runTechStackAgent,
  runWebPerformanceAgent,
} from "./agents/index";

// ============================================================================
// Public API
// ============================================================================

export interface RunDiagnosticOptions {
  url: string;
  storage: DiagnosticSessionStorage;
  /** Skip 24-hour cache and force a fresh scan */
  force?: boolean;
}

export interface RunDiagnosticResult {
  token: string;
  cached: boolean;
}

/**
 * Start a diagnostic scan for the given URL.
 *
 * Returns immediately with a session token. Agents run in the background.
 * Poll GET /api/diagnostic/session/:token for progressive status updates.
 *
 * @throws Error if the URL is invalid or resolves to a private IP (SSRF guard)
 */
export async function runDiagnostic(
  options: RunDiagnosticOptions,
): Promise<RunDiagnosticResult> {
  const { url, storage, force } = options;

  // Step 1: SSRF validation — throws on bad URL, private IP, or unsupported protocol
  const validated = await validateUrl(url);
  const normalizedUrl = validated.normalized;

  // Step 2: Check 24-hour result cache (skip if force=true)
  if (!force) {
    const cached = await storage.findRecentByNormalizedUrl(
      normalizedUrl,
      24 * 60 * 60 * 1000,
    );
    if (cached) {
      return { token: cached.token, cached: true };
    }
  }

  // Step 3: Create a new session with all agents initialized to "pending"
  const session = await storage.create({ url, normalizedUrl });

  // Step 4: Fire-and-forget agent execution — never await this
  Promise.resolve()
    .then(() => executeAgents(session.token, url, storage))
    .catch((error) => {
      console.error(
        `[diagnostic] Unhandled error in executeAgents for token ${session.token}:`,
        error,
      );
    });

  // Return the token immediately — caller gets response before agents start
  return { token: session.token, cached: false };
}

// ============================================================================
// Rate Limiting
// ============================================================================

/** In-memory per-IP rate limiter (resets on server restart) */
const rateLimiter = new Map<string, number>();

/** Minimum milliseconds between scan requests from the same IP */
const RATE_LIMIT_MS = 10_000; // 10 seconds

/**
 * Check if the given IP is within the rate limit window.
 * Returns true if the request is allowed; false if it should be rejected.
 * Updates the last-request timestamp on success.
 */
export function checkRateLimit(ip: string): boolean {
  const last = rateLimiter.get(ip) ?? 0;

  if (Date.now() - last < RATE_LIMIT_MS) {
    return false; // Too soon
  }

  rateLimiter.set(ip, Date.now());

  // Periodically evict expired entries to prevent unbounded memory growth
  if (rateLimiter.size > 10_000) {
    const cutoff = Date.now() - RATE_LIMIT_MS * 2;
    for (const [key, time] of rateLimiter) {
      if (time < cutoff) rateLimiter.delete(key);
    }
  }

  return true;
}

// ============================================================================
// Internal: Agent Execution
// ============================================================================

/**
 * Agent task descriptor — typed per-agent to preserve return types.
 */
interface AgentTask {
  id: DiagnosticAgentId;
  name: string;
  run: () => Promise<unknown>;
  timeoutMs: number;
}

/**
 * Run a single agent with status tracking and timeout protection.
 * Never throws — all errors are caught and stored in the session.
 */
async function runAgentWithTracking(
  agent: AgentTask,
  token: string,
  storage: DiagnosticSessionStorage,
): Promise<void> {
  const startedAt = new Date().toISOString();

  await storage.updateAgentStatus(token, agent.id, {
    status: "running",
    startedAt,
  });

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Agent timeout after ${agent.timeoutMs}ms`)),
        agent.timeoutMs,
      ),
    );

    const result = await Promise.race([agent.run(), timeoutPromise]);

    const completedAt = new Date().toISOString();

    await storage.updateAgentStatus(token, agent.id, {
      status: "completed",
      startedAt,
      completedAt,
    });

    // Store the result — agent id maps to result key
    const resultKey = agentIdToResultKey(agent.id);
    await storage.updateResults(token, resultKey, result);
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      `[diagnostic] Agent "${agent.id}" failed for token ${token}:`,
      errorMessage,
    );

    await storage.updateAgentStatus(token, agent.id, {
      status: "failed",
      startedAt,
      completedAt,
      error: errorMessage,
    });
    // Do NOT rethrow — partial results are acceptable per CONTEXT.md
  }
}

/**
 * Map agent ID to the corresponding key in DiagnosticResult.
 */
function agentIdToResultKey(
  agentId: DiagnosticAgentId,
): "webPerformance" | "seo" | "techStack" | "companyContext" {
  switch (agentId) {
    case "web_performance":
      return "webPerformance";
    case "seo":
      return "seo";
    case "tech_stack":
      return "techStack";
    case "company_context":
      return "companyContext";
  }
}

/**
 * Execute all 4 agents in parallel for a given session.
 *
 * This is the fire-and-forget background function called by runDiagnostic.
 * Updates session status progressively:
 *   pending → running (immediately)
 *   running → completed (after all agents settle, even if some fail)
 *
 * If the initial page crawl fails, all agents are set to "failed" and
 * the session status is set to "failed" early.
 */
async function executeAgents(
  token: string,
  url: string,
  storage: DiagnosticSessionStorage,
): Promise<void> {
  // Mark session as running
  await storage.updateSessionStatus(token, "running");

  // Crawl the homepage — all agents share this result to avoid redundant requests
  let crawl: CrawlResult;
  try {
    crawl = await crawlPage(url, { timeoutMs: 30_000 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[diagnostic] Homepage crawl failed for token ${token}:`,
      errorMessage,
    );

    // Mark all agents as failed — no crawl data to work with
    const agentIds: DiagnosticAgentId[] = [
      "web_performance",
      "seo",
      "tech_stack",
      "company_context",
    ];
    const failedAt = new Date().toISOString();
    await Promise.allSettled(
      agentIds.map((id) =>
        storage.updateAgentStatus(token, id, {
          status: "failed",
          completedAt: failedAt,
          error: `Homepage crawl failed: ${errorMessage}`,
        }),
      ),
    );

    await storage.updateSessionStatus(token, "failed");
    return;
  }

  // Build agent tasks — each agent runs concurrently
  const agentTasks: AgentTask[] = [
    {
      id: "web_performance",
      name: "Web Performance",
      run: () => runWebPerformanceAgent(url, crawl),
      timeoutMs: 90_000, // PSI API can be slow
    },
    {
      id: "seo",
      name: "SEO Analysis",
      run: () => runSeoAgent(crawl),
      timeoutMs: 30_000,
    },
    {
      id: "tech_stack",
      name: "Tech Stack Detection",
      run: () => runTechStackAgent(crawl),
      timeoutMs: 30_000,
    },
    {
      id: "company_context",
      name: "Company Context",
      run: () => runCompanyContextAgent(url, crawl),
      timeoutMs: 60_000, // Multi-page crawl + optional LLM call
    },
  ];

  // Run all agents concurrently — Promise.allSettled never rejects
  const results = await Promise.allSettled(
    agentTasks.map((agent) => runAgentWithTracking(agent, token, storage)),
  );

  // Count outcomes for logging
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const total = agentTasks.length;

  console.log(
    `[diagnostic] Scan complete for ${url}: ${succeeded}/${total} agents succeeded`,
  );

  // Always mark session as "completed" — even with partial results
  // Per CONTEXT.md: "always produce a report, even if incomplete"
  await storage.updateSessionStatus(token, "completed");
}

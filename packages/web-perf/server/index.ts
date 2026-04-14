import { withRuntime } from "@decocms/runtime";
import { createPublicPrompt, createPublicResource } from "@decocms/runtime";
import { z } from "zod";
import { SITE_ADD } from "./tools/site-add.ts";
import { SITE_LIST } from "./tools/site-list.ts";
import { SITE_GET } from "./tools/site-get.ts";
import { SITE_DELETE } from "./tools/site-delete.ts";
import { PERF_SNAPSHOT } from "./tools/perf-snapshot.ts";
import { PERF_REPORT } from "./tools/perf-report.ts";
import { CRUX_HISTORY } from "./tools/crux-history.ts";
import { AGENT_INSTRUCTIONS } from "./lib/agent-instructions.ts";
import { renderDashboard } from "./ui/dashboard.ts";
import { renderSiteDetail } from "./ui/site-detail.ts";
import { listSites, loadSite } from "./lib/storage.ts";

const RESOURCE_MIME = "text/html;profile=mcp-app";
const port = Number(process.env.PORT) || 3002;
const API_ORIGIN = `http://localhost:${port}`;

const resourceCsp = {
  connectDomains: [API_ORIGIN],
};

// ── Prompts ──

const initialSetupPrompt = createPublicPrompt({
  name: "initial-setup",
  title: "Web Performance Setup",
  description:
    "Add a website, collect performance data, and generate a comprehensive initial report",
  argsSchema: {
    url: z
      .string()
      .describe("The website URL to track (e.g., https://example.com)"),
    name: z.string().optional().describe("A friendly name for the site"),
    apiKey: z
      .string()
      .optional()
      .describe("Google API key for CrUX and PageSpeed APIs"),
  },
  execute: async ({ args }: { args: Record<string, string | undefined> }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `I want to set up web performance monitoring for ${args.url}${args.name ? ` (${args.name})` : ""}.

Please do the following steps in order:
1. Add the site using SITE_ADD with origin "${args.url}"${args.name ? ` and name "${args.name}"` : ""}${args.apiKey ? ` and apiKey "${args.apiKey}"` : ""}.
2. Take a performance snapshot using PERF_SNAPSHOT for the new site${args.apiKey ? ` with apiKey "${args.apiKey}"` : ""}.
3. Fetch CrUX history data using CRUX_HISTORY for the new site${args.apiKey ? ` with apiKey "${args.apiKey}"` : ""}.
4. Generate a performance report using PERF_REPORT for the new site.

After completing all steps, provide a summary that includes:
- Overall performance rating and score
- Core Web Vitals status (LCP, INP, CLS) with ratings
- Top 3 performance opportunities with estimated savings
- Whether the site passes the Core Web Vitals assessment
- A brief trend analysis if CrUX history data is available`,
        },
      },
    ],
  }),
});

const performanceAuditPrompt = createPublicPrompt({
  name: "performance-audit",
  title: "Deep Performance Audit",
  description:
    "Comprehensive performance analysis with actionable fixes and prioritized recommendations",
  argsSchema: {
    siteId: z.string().describe("The site ID to audit"),
  },
  execute: async ({ args }: { args: Record<string, string | undefined> }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Perform a deep performance audit for site ${args.siteId}.

Steps:
1. Get the full site data using SITE_GET for site "${args.siteId}".
2. If the latest snapshot is older than 24 hours, take a fresh snapshot with PERF_SNAPSHOT.
3. Generate a performance report using PERF_REPORT.

Then produce a detailed audit report with these sections:

## Core Web Vitals Assessment
For each CWV (LCP, INP, CLS): current p75, rating, trend direction (improving/stable/degrading), and what the metric means for users.

## Priority Fixes
For each issue:
- Priority: CRITICAL / HIGH / MEDIUM / LOW
- Metric impacted and estimated improvement
- Specific technical fix (code-level where possible)
- Implementation complexity (easy/medium/hard)

## Quick Wins (< 1 hour effort)
Easy fixes with high impact.

## Architecture Recommendations
Longer-term improvements for sustained performance.

## Actionable Next Steps
Numbered list of concrete actions ordered by impact. Format each so it could be sent as a GitHub issue or forwarded to a site editor agent.`,
        },
      },
    ],
  }),
});

// ── Resources ──

const dashboardResource = createPublicResource({
  uri: "ui://web-perf/dashboard",
  name: "Web Performance Dashboard",
  description: "Overview of all tracked sites with performance scores",
  mimeType: RESOURCE_MIME,
  read: () => ({
    uri: "ui://web-perf/dashboard",
    mimeType: RESOURCE_MIME,
    text: renderDashboard(),
    _meta: { ui: { csp: resourceCsp } },
  }),
});

const siteDetailResource = createPublicResource({
  uri: "ui://web-perf/site-detail",
  name: "Site Performance Detail",
  description:
    "Detailed performance view with CWV gauges, histograms, trend charts, and opportunities",
  mimeType: RESOURCE_MIME,
  read: () => ({
    uri: "ui://web-perf/site-detail",
    mimeType: RESOURCE_MIME,
    text: renderSiteDetail(API_ORIGIN),
    _meta: { ui: { csp: resourceCsp } },
  }),
});

// ── MCP Server ──

const mcpServer = withRuntime({
  serverInfo: {
    name: "web-perf",
    version: "0.1.0",
    instructions: AGENT_INSTRUCTIONS,
  },
  tools: [
    SITE_ADD,
    SITE_LIST,
    SITE_GET,
    SITE_DELETE,
    PERF_SNAPSHOT,
    PERF_REPORT,
    CRUX_HISTORY,
  ],
  prompts: [initialSetupPrompt, performanceAuditPrompt],
  resources: [dashboardResource, siteDetailResource],
  cors: {
    origin: "*",
  },
});

// ── REST API for UI iframe polling ──

function handleApi(req: Request): Response | null {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // GET /api/sites — list all sites (trimmed)
  if (url.pathname === "/api/sites" && req.method === "GET") {
    return (async () => {
      const sites = await listSites();
      const trimmed = sites.map((s) => ({
        ...s,
        snapshots: s.snapshots.slice(0, 1),
      }));
      return new Response(JSON.stringify({ sites: trimmed }), {
        headers: corsHeaders,
      });
    })() as unknown as Response;
  }

  // GET /api/sites/:id — single site
  const siteMatch = url.pathname.match(/^\/api\/sites\/([^/]+)$/);
  if (siteMatch && req.method === "GET") {
    return (async () => {
      const site = await loadSite(siteMatch[1]);
      if (!site) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }
      return new Response(JSON.stringify({ site }), {
        headers: corsHeaders,
      });
    })() as unknown as Response;
  }

  return null;
}

export default {
  fetch: async (req: Request, env?: unknown, ctx?: unknown) => {
    const apiResponse = handleApi(req);
    if (apiResponse) return apiResponse;
    return (mcpServer.fetch as Function)(req, env, ctx);
  },
  port,
};

console.log(`[web-perf] MCP server running on http://localhost:${port}/mcp`);
console.log(`[web-perf] REST API at http://localhost:${port}/api/sites`);

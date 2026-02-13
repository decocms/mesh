#!/usr/bin/env npx tsx
/**
 * Example MCP server implementing the REPORTS_BINDING.
 *
 * Run:   npx tsx packages/mesh-plugin-reports/example-server.ts
 *
 * Then in Mesh, add an HTTP connection pointing to http://localhost:4500/mcp
 * and enable the "reports" plugin in your project settings, selecting that connection.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

// ============================================================================
// In-memory sample data
// ============================================================================

interface MetricItem {
  label: string;
  value: number | string;
  unit?: string;
  previousValue?: number | string;
  status?: "passing" | "warning" | "failing" | "info";
}

type ReportSection =
  | { type: "markdown"; content: string }
  | { type: "metrics"; title?: string; items: MetricItem[] }
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: (string | number | null)[][];
    };

type ReportLifecycleStatus = "unread" | "read" | "dismissed";

interface Report {
  id: string;
  title: string;
  category: string;
  status: "passing" | "warning" | "failing" | "info";
  summary: string;
  updatedAt: string;
  source?: string;
  tags?: string[];
  lifecycleStatus: ReportLifecycleStatus;
  sections: ReportSection[];
}

const REPORTS: Report[] = [
  {
    id: "perf-homepage",
    title: "Performance Report - Homepage",
    category: "performance",
    status: "warning",
    summary: "Performance score dropped from 92 to 78",
    updatedAt: new Date().toISOString(),
    source: "pagespeed-insights",
    tags: ["homepage", "web-vitals"],
    lifecycleStatus: "unread",
    sections: [
      {
        type: "markdown",
        content:
          "## Overview\n\nPageSpeed Insights analysis for **https://example.com** run on " +
          new Date().toLocaleDateString() +
          ".\n\nThe performance score has regressed primarily due to unoptimized images and a large JavaScript bundle.",
      },
      {
        type: "metrics",
        title: "Core Web Vitals",
        items: [
          {
            label: "Performance",
            value: 78,
            previousValue: 92,
            unit: "score",
            status: "warning",
          },
          {
            label: "LCP",
            value: 2.8,
            previousValue: 1.9,
            unit: "s",
            status: "failing",
          },
          {
            label: "FCP",
            value: 1.2,
            previousValue: 1.1,
            unit: "s",
            status: "passing",
          },
          {
            label: "CLS",
            value: 0.05,
            previousValue: 0.08,
            unit: "",
            status: "passing",
          },
          {
            label: "TBT",
            value: 450,
            previousValue: 200,
            unit: "ms",
            status: "warning",
          },
          {
            label: "Speed Index",
            value: 3.1,
            previousValue: 2.4,
            unit: "s",
            status: "warning",
          },
        ],
      },
      {
        type: "markdown",
        content:
          "### Largest Contentful Paint\n\nThe LCP regressed from **1.9s** to **2.8s** due to `hero-image.jpg` being served uncompressed at 2.4 MB. Converting to WebP and resizing would reduce this to ~200 KB.",
      },
      {
        type: "table",
        title: "Largest Resources",
        columns: ["Resource", "Size", "Load Time", "Impact"],
        rows: [
          ["hero-image.jpg", "2.4 MB", "1.8s", "High"],
          ["main.js", "450 KB", "0.8s", "Medium"],
          ["vendor.js", "380 KB", "0.6s", "Medium"],
          ["styles.css", "120 KB", "0.2s", "Low"],
          ["analytics.js", "45 KB", "0.1s", "Low"],
        ],
      },
    ],
  },
  {
    id: "security-deps",
    title: "Security Vulnerability Scan - Dependencies",
    category: "security",
    status: "failing",
    summary: "3 critical, 5 high severity vulnerabilities found",
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    source: "npm-audit",
    tags: ["dependencies", "ci"],
    lifecycleStatus: "unread",
    sections: [
      {
        type: "markdown",
        content:
          "## Dependency Audit\n\nAutomated security scan found **8 vulnerabilities** across project dependencies.\n\n> **3 critical** and **5 high** severity issues require immediate attention.",
      },
      {
        type: "metrics",
        title: "Vulnerability Summary",
        items: [
          { label: "Critical", value: 3, unit: "issues", status: "failing" },
          { label: "High", value: 5, unit: "issues", status: "warning" },
          { label: "Medium", value: 12, unit: "issues", status: "info" },
          { label: "Low", value: 8, unit: "issues", status: "passing" },
        ],
      },
      {
        type: "table",
        title: "Critical & High Vulnerabilities",
        columns: [
          "Package",
          "Severity",
          "Vulnerability",
          "Fix Available",
          "Path",
        ],
        rows: [
          [
            "lodash",
            "Critical",
            "Prototype Pollution (CVE-2021-23337)",
            "Yes (4.17.21)",
            "express > lodash",
          ],
          [
            "axios",
            "Critical",
            "SSRF via redirect (CVE-2023-45857)",
            "Yes (1.6.0)",
            "direct",
          ],
          [
            "jsonwebtoken",
            "Critical",
            "JWT Forgery (CVE-2022-23529)",
            "Yes (9.0.0)",
            "auth > jsonwebtoken",
          ],
          [
            "minimatch",
            "High",
            "ReDoS (CVE-2022-3517)",
            "Yes (3.1.2)",
            "glob > minimatch",
          ],
          [
            "qs",
            "High",
            "Prototype Pollution (CVE-2022-24999)",
            "Yes (6.11.0)",
            "express > qs",
          ],
          [
            "semver",
            "High",
            "ReDoS (CVE-2022-25883)",
            "Yes (7.5.4)",
            "npm > semver",
          ],
          [
            "tough-cookie",
            "High",
            "Prototype Pollution (CVE-2023-26136)",
            "Yes (4.1.3)",
            "request > tough-cookie",
          ],
          [
            "word-wrap",
            "High",
            "ReDoS (CVE-2023-26115)",
            "Yes (1.2.4)",
            "optionator > word-wrap",
          ],
        ],
      },
    ],
  },
  {
    id: "a11y-landing",
    title: "Accessibility Audit - Landing Page",
    category: "accessibility",
    status: "passing",
    summary: "98/100 accessibility score, 2 minor issues",
    updatedAt: new Date(Date.now() - 86400_000).toISOString(),
    source: "axe-core",
    tags: ["landing-page", "wcag"],
    lifecycleStatus: "read",
    sections: [
      {
        type: "markdown",
        content:
          "## Accessibility Report\n\nAutomated accessibility scan using **axe-core** on the landing page.\n\nOverall the page is in excellent shape with only 2 minor issues found.",
      },
      {
        type: "metrics",
        title: "Scores",
        items: [
          {
            label: "Accessibility",
            value: 98,
            unit: "score",
            status: "passing",
          },
          { label: "Violations", value: 2, unit: "issues", status: "info" },
          { label: "Passes", value: 47, unit: "rules", status: "passing" },
        ],
      },
      {
        type: "table",
        title: "Issues Found",
        columns: ["Rule", "Impact", "Element", "Description"],
        rows: [
          [
            "color-contrast",
            "Minor",
            "footer .subtle-text",
            "Text color #999 on #fff has contrast ratio 2.85:1 (needs 4.5:1)",
          ],
          [
            "image-alt",
            "Minor",
            "img.decorative-bg",
            "Decorative image should have empty alt attribute",
          ],
        ],
      },
    ],
  },
  {
    id: "bundle-analysis",
    title: "Bundle Size Analysis",
    category: "performance",
    status: "info",
    summary: "Total bundle: 1.2 MB (gzipped: 380 KB)",
    updatedAt: new Date(Date.now() - 172800_000).toISOString(),
    source: "webpack-bundle-analyzer",
    tags: ["build", "ci"],
    lifecycleStatus: "dismissed",
    sections: [
      {
        type: "markdown",
        content:
          "## Bundle Analysis\n\nBreakdown of the production JavaScript bundle.\n\nThe total bundle size is **1.2 MB** (380 KB gzipped). The largest contributors are charting libraries and polyfills.",
      },
      {
        type: "metrics",
        title: "Bundle Overview",
        items: [
          { label: "Total Size", value: "1.2 MB", status: "info" },
          { label: "Gzipped", value: "380 KB", status: "info" },
          { label: "Chunks", value: 12, status: "info" },
          { label: "Modules", value: 847, status: "info" },
        ],
      },
      {
        type: "table",
        title: "Top Modules by Size",
        columns: ["Module", "Raw Size", "Gzipped", "% of Total"],
        rows: [
          ["recharts", "320 KB", "98 KB", "26.7%"],
          ["core-js (polyfills)", "180 KB", "55 KB", "15.0%"],
          ["react-dom", "140 KB", "45 KB", "11.7%"],
          ["lodash (full)", "72 KB", "24 KB", "6.0%"],
          ["moment.js", "68 KB", "22 KB", "5.7%"],
          ["App code", "420 KB", "136 KB", "35.0%"],
        ],
      },
    ],
  },
];

// ============================================================================
// MCP Server Factory (stateless -- new server per request)
// ============================================================================

function createServer(): McpServer {
  const server = new McpServer(
    { name: "example-reports-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // --- REPORTS_LIST ---
  server.tool(
    "REPORTS_LIST",
    "List all available reports with optional filters",
    {
      category: z.string().optional().describe("Filter by category"),
      status: z
        .enum(["passing", "warning", "failing", "info"])
        .optional()
        .describe("Filter by status"),
    },
    async (args) => {
      let filtered = REPORTS;
      if (args.category) {
        filtered = filtered.filter((r) => r.category === args.category);
      }
      if (args.status) {
        filtered = filtered.filter((r) => r.status === args.status);
      }

      const summaries = filtered.map(({ sections, ...summary }) => summary);

      return {
        content: [
          { type: "text", text: JSON.stringify({ reports: summaries }) },
        ],
        structuredContent: { reports: summaries },
      };
    },
  );

  // --- REPORTS_GET ---
  server.tool(
    "REPORTS_GET",
    "Get a specific report with full content",
    {
      id: z.string().describe("Report identifier"),
    },
    async (args) => {
      const report = REPORTS.find((r) => r.id === args.id);
      if (!report) {
        return {
          content: [{ type: "text", text: `Report "${args.id}" not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(report) }],
        structuredContent: report,
      };
    },
  );

  // --- REPORTS_UPDATE_STATUS ---
  server.tool(
    "REPORTS_UPDATE_STATUS",
    "Update the lifecycle status of a report",
    {
      reportId: z.string().describe("Report identifier"),
      lifecycleStatus: z
        .enum(["unread", "read", "dismissed"])
        .describe("New lifecycle status"),
    },
    async (args) => {
      const report = REPORTS.find((r) => r.id === args.reportId);
      if (!report) {
        const result = {
          success: false,
          message: `Report "${args.reportId}" not found`,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }

      report.lifecycleStatus = args.lifecycleStatus;
      console.log(`[UPDATE_STATUS] ${report.title} -> ${args.lifecycleStatus}`);

      const result = {
        success: true,
        message: `Report status updated to "${args.lifecycleStatus}"`,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  return server;
}

// ============================================================================
// HTTP Transport
// ============================================================================

const PORT = 4500;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/mcp") {
      const server = createServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse:
          req.headers.get("Accept")?.includes("application/json") ?? false,
      });
      await server.connect(transport);
      return await transport.handleRequest(req);
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", name: "example-reports-mcp" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(
  `\nExample Reports MCP Server running at http://localhost:${PORT}/mcp`,
);
console.log(
  `\nConnect in Mesh as an HTTP connection to: http://localhost:${PORT}/mcp`,
);
console.log(`Then enable the "reports" plugin in project settings.\n`);

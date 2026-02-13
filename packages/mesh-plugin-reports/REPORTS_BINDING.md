# Reports Binding — MCP Server Implementation Guide

This document specifies the **Reports Binding** contract that an MCP server must implement to be compatible with the Mesh Reports plugin. Use it as a reference when building an MCP server that produces automated reports (performance audits, security scans, accessibility checks, CI summaries, etc.).

---

## Overview

The Reports plugin displays an inbox-style UI of reports sourced from one or more MCP connections. Each report has a **status** (health outcome), a **lifecycle status** (inbox workflow state), and **sections** (rich content blocks).

A connection is detected as reports-compatible when it exposes all **required** tools listed below. The plugin calls these tools via the standard MCP `tools/call` RPC.

---

## Tools

### Required

| Tool | Purpose |
|---|---|
| `REPORTS_LIST` | List available reports with optional filters |
| `REPORTS_GET` | Get a single report with full content |

### Optional

| Tool | Purpose |
|---|---|
| `REPORTS_UPDATE_STATUS` | Update the lifecycle status of a report (`unread` / `read` / `dismissed`) |

Optional tools may be omitted. The UI will hide the corresponding controls when they are absent.

---

## Schemas

All tool inputs and outputs must be returned as **structured content** (JSON). The MCP SDK `structuredContent` field is used alongside the standard `content` text array.

### Shared Types

#### ReportStatus

Overall health/outcome of the report:

```
"passing" | "warning" | "failing" | "info"
```

#### ReportLifecycleStatus

Inbox workflow state:

```
"unread" | "read" | "dismissed"
```

| Value | Meaning |
|---|---|
| `unread` | New report, not yet viewed. Shown in Inbox with bold title and accent indicator. |
| `read` | Report has been viewed. Shown in Inbox without unread styling. |
| `dismissed` | Report has been archived / marked as done. Shown in the Done tab. |

#### MetricItem

```json
{
  "label": "string — metric label (e.g. 'LCP', 'Performance')",
  "value": "number | string — current value",
  "unit?": "string — unit of measurement (e.g. 's', 'ms', 'score')",
  "previousValue?": "number | string — previous value for delta comparison",
  "status?": "ReportStatus — status of this individual metric"
}
```

#### ReportSection (discriminated union on `type`)

**Markdown section**
```json
{
  "type": "markdown",
  "content": "string — markdown content (GFM supported)"
}
```

**Metrics section**
```json
{
  "type": "metrics",
  "title?": "string — section title",
  "items": "MetricItem[] — array of metric items"
}
```

**Table section**
```json
{
  "type": "table",
  "title?": "string — section title",
  "columns": "string[] — column headers",
  "rows": "(string | number | null)[][] — table rows"
}
```

#### ReportSummary

Returned by `REPORTS_LIST`. Contains metadata only (no sections).

```json
{
  "id": "string — unique report identifier",
  "title": "string — report title",
  "category": "string — e.g. 'performance', 'security', 'accessibility'",
  "status": "ReportStatus — overall health outcome",
  "summary": "string — one-line summary of findings",
  "updatedAt": "string — ISO 8601 timestamp",
  "source?": "string — agent or service that generated the report (e.g. 'security-auditor', 'performance-monitor')",
  "tags?": "string[] — free-form tags for filtering (e.g. ['homepage', 'api', 'ci'])",
  "lifecycleStatus?": "ReportLifecycleStatus — inbox workflow state (default: 'unread')"
}
```

#### Report (full)

Returned by `REPORTS_GET`. Extends `ReportSummary` with content.

```json
{
  "...ReportSummary fields",
  "sections": "ReportSection[] — ordered content sections"
}
```

---

## Tool Specifications

### REPORTS_LIST

List available reports with optional filtering.

**Input:**
```json
{
  "category?": "string — filter by category (e.g. 'performance', 'security')",
  "status?": "ReportStatus — filter by report status"
}
```

**Output:**
```json
{
  "reports": "ReportSummary[] — list of report summaries"
}
```

**Notes:**
- Return all reports when no filters are provided.
- The `lifecycleStatus` field drives the inbox/done tabs in the UI. Reports with `lifecycleStatus: "dismissed"` appear under "Done"; everything else appears in "Inbox". Reports with `lifecycleStatus: "unread"` (or no `lifecycleStatus`) are shown with unread styling.
- Order reports by `updatedAt` descending (most recent first) unless the server has a more meaningful ordering.

---

### REPORTS_GET

Retrieve a single report by ID with full sections.

**Input:**
```json
{
  "id": "string — report identifier"
}
```

**Output:**
The full `Report` object (see schema above).

**Notes:**
- Return an MCP error (set `isError: true`) if the report ID is not found.
- The UI renders sections in array order — put the most important information first.
- The UI auto-calls `REPORTS_UPDATE_STATUS` (if available) with `lifecycleStatus: "read"` when a report is opened.

---

### REPORTS_UPDATE_STATUS (optional)

Update the lifecycle status of a report.

**Input:**
```json
{
  "reportId": "string — report identifier",
  "lifecycleStatus": "ReportLifecycleStatus — new lifecycle status"
}
```

**Output:**
```json
{
  "success": "boolean",
  "message?": "string"
}
```

**Notes:**
- The UI calls this automatically when a report is opened (sets `"read"`).
- The "Mark as done" button sets `"dismissed"`. Restoring from done sets `"read"`.
- If not implemented, the unread indicators and dismiss buttons in the UI will not function, but the plugin remains usable as a read-only viewer.

---

## Binding Detection

The Mesh Reports plugin determines whether a connection is compatible by checking the connection's tool list against the binding definition. The check verifies that all **required** tool names are present (exact string match). Optional tools are skipped if absent.

A connection is considered reports-compatible when it exposes at minimum:
- `REPORTS_LIST`
- `REPORTS_GET`

No schema validation is performed at detection time — only tool name presence.

---

## Implementation Checklist

1. **Register both required tools** (`REPORTS_LIST`, `REPORTS_GET`) in your MCP server.
2. **Return structured content** — set both `content` (text array) and `structuredContent` (typed JSON) on every tool response.
3. **Use consistent report IDs** — the UI uses `id` to navigate between list and detail views.
4. **Provide meaningful sections** — use `markdown` for narrative, `metrics` for KPIs with deltas, and `table` for tabular data. Order them from most to least important.
5. **Support filtering** — handle `category` and `status` filters in `REPORTS_LIST` (return all when omitted).
6. **Set `lifecycleStatus`** — default to `"unread"` for new reports. The field is optional (omitted is treated as `"unread"` by the UI).
7. **(Optional) Implement `REPORTS_UPDATE_STATUS`** for full inbox workflow support (read tracking, dismiss/restore).

---

## Example: Minimal MCP Server (TypeScript)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer(
  { name: "my-reports-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// REPORTS_LIST
server.tool(
  "REPORTS_LIST",
  "List all available reports",
  {
    category: z.string().optional(),
    status: z.enum(["passing", "warning", "failing", "info"]).optional(),
  },
  async ({ category, status }) => {
    let reports = await fetchReports(); // your data source
    if (category) reports = reports.filter((r) => r.category === category);
    if (status) reports = reports.filter((r) => r.status === status);

    const summaries = reports.map(({ sections, ...summary }) => summary);

    return {
      content: [{ type: "text", text: JSON.stringify({ reports: summaries }) }],
      structuredContent: { reports: summaries },
    };
  },
);

// REPORTS_GET
server.tool(
  "REPORTS_GET",
  "Get a specific report with full content",
  { id: z.string() },
  async ({ id }) => {
    const report = await getReport(id); // your data source
    if (!report) {
      return {
        content: [{ type: "text", text: `Report "${id}" not found` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(report) }],
      structuredContent: report,
    };
  },
);

// REPORTS_UPDATE_STATUS (optional)
server.tool(
  "REPORTS_UPDATE_STATUS",
  "Update the lifecycle status of a report",
  {
    reportId: z.string(),
    lifecycleStatus: z.enum(["unread", "read", "dismissed"]),
  },
  async ({ reportId, lifecycleStatus }) => {
    await updateReportStatus(reportId, lifecycleStatus); // your data source
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }) }],
      structuredContent: { success: true },
    };
  },
);
```

---

## Connecting to Mesh

1. Start your MCP server (HTTP or stdio transport).
2. In the Mesh UI, add a **connection** pointing to your server's MCP endpoint.
3. Enable the **Reports** plugin in your project settings and select the connection.
4. The plugin will auto-detect your server's compatibility via binding detection and begin fetching reports.

---

## Categories

Categories are free-form strings. The UI uses them for filtering. Common conventions:

| Category | Use case |
|---|---|
| `performance` | Web vitals, bundle size, load times |
| `security` | Vulnerability scans, dependency audits |
| `accessibility` | WCAG compliance, axe-core results |
| `seo` | Meta tags, structured data, crawlability |
| `quality` | Code quality, test coverage, lint results |
| `uptime` | Health checks, availability monitoring |
| `compliance` | License audits, policy checks |

You can define your own categories. The UI displays whatever you return.

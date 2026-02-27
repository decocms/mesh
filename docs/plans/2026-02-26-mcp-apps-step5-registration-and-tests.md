# Implementation Plan: MCP Apps Step 5 — Tool Registration, Index Updates & Tests

**Date:** 2026-02-26  
**Status:** Draft  
**Context:** Reimplementing MCP Apps support using the official `@modelcontextprotocol/ext-apps` SDK. Step 5 wires everything together after Steps 0–4 and adds tests.

## Overview

After Steps 0–4, all implementation is in place. Step 5:

1. Ensures the tool registry and tools index include all 28 UI widget tools
2. Registers UI widget resources on the MCP server with the correct MIME type
3. Adds or ports unit tests for mcp-apps types, CSP injector, and resource loader
4. Verifies decopilot helpers and code-execution utils for `ui://` resource handling
5. Runs the full verification checklist

---

## 1. Tool Registry — `apps/mesh/src/tools/registry.ts`

### 1.1 ToolCategory union type

Add `"UI Widgets"` if not already present:

```typescript
export type ToolCategory =
  | "Organizations"
  | "Connections"
  | "Virtual MCPs"
  | "Virtual Tools"
  | "Threads"
  | "Monitoring"
  | "Users"
  | "API Keys"
  | "Event Bus"
  | "Code Execution"
  | "Tags"
  | "Projects"
  | "UI Widgets";
```

### 1.2 ALL_TOOL_NAMES

Add all 28 UI widget tool names (in order, after Project tools):

```typescript
  // UI Widget tools
  "UI_COUNTER",
  "UI_METRIC",
  "UI_PROGRESS",
  "UI_GREETING",
  "UI_CHART",
  "UI_TIMER",
  "UI_STATUS",
  "UI_QUOTE",
  "UI_SPARKLINE",
  "UI_CODE",
  "UI_CONFIRMATION",
  "UI_JSON_VIEWER",
  "UI_TABLE",
  "UI_DIFF",
  "UI_TODO",
  "UI_MARKDOWN",
  "UI_IMAGE",
  "UI_FORM_RESULT",
  "UI_ERROR",
  "UI_NOTIFICATION",
  // Shadcn-inspired UI widgets
  "UI_AVATAR",
  "UI_SWITCH",
  "UI_SLIDER",
  "UI_RATING",
  "UI_KBD",
  "UI_STATS_GRID",
  "UI_AREA_CHART",
  "UI_CALENDAR",
```

### 1.3 MANAGEMENT_TOOLS metadata entries

Add one entry per UI widget tool (name, description, category: `"UI Widgets"`):

| Tool Name | Description |
|-----------|-------------|
| UI_COUNTER | Interactive counter widget |
| UI_METRIC | Key metric display with trend |
| UI_PROGRESS | Visual progress bar |
| UI_GREETING | Personalized greeting card |
| UI_CHART | Animated bar chart |
| UI_TIMER | Interactive timer |
| UI_STATUS | Status badge indicator |
| UI_QUOTE | Quote display with attribution |
| UI_SPARKLINE | Compact trend chart |
| UI_CODE | Code snippet display |
| UI_CONFIRMATION | Confirmation dialog |
| UI_JSON_VIEWER | JSON tree viewer |
| UI_TABLE | Data table display |
| UI_DIFF | Text diff viewer |
| UI_TODO | Interactive todo list |
| UI_MARKDOWN | Rendered markdown content |
| UI_IMAGE | Image display with caption |
| UI_FORM_RESULT | Form submission result |
| UI_ERROR | Error display with details |
| UI_NOTIFICATION | Notification banner |
| UI_AVATAR | User avatar with status |
| UI_SWITCH | Toggle switch |
| UI_SLIDER | Range slider |
| UI_RATING | Star rating display |
| UI_KBD | Keyboard shortcuts |
| UI_STATS_GRID | Dashboard stats grid |
| UI_AREA_CHART | Area chart with gradient |
| UI_CALENDAR | Mini calendar |

Example entry:

```typescript
{
  name: "UI_COUNTER",
  description: "Interactive counter widget",
  category: "UI Widgets",
},
```

### 1.4 TOOL_LABELS entries

Add human-readable labels for each tool:

| Tool Name | Label |
|-----------|-------|
| UI_COUNTER | Interactive counter |
| UI_METRIC | Metric display |
| UI_PROGRESS | Progress bar |
| UI_GREETING | Greeting card |
| UI_CHART | Bar chart |
| UI_TIMER | Timer |
| UI_STATUS | Status badge |
| UI_QUOTE | Quote display |
| UI_SPARKLINE | Sparkline chart |
| UI_CODE | Code snippet |
| UI_CONFIRMATION | Confirmation dialog |
| UI_JSON_VIEWER | JSON viewer |
| UI_TABLE | Data table |
| UI_DIFF | Diff viewer |
| UI_TODO | Todo list |
| UI_MARKDOWN | Markdown content |
| UI_IMAGE | Image display |
| UI_FORM_RESULT | Form result |
| UI_ERROR | Error display |
| UI_NOTIFICATION | Notification |
| UI_AVATAR | User avatar |
| UI_SWITCH | Toggle switch |
| UI_SLIDER | Range slider |
| UI_RATING | Star rating |
| UI_KBD | Keyboard shortcuts |
| UI_STATS_GRID | Stats dashboard |
| UI_AREA_CHART | Area chart |
| UI_CALENDAR | Calendar |

### 1.5 getToolsByCategory()

Add `"UI Widgets": []` to the initial `grouped` object:

```typescript
const grouped: Record<string, ToolMetadata[]> = {
  // ... existing categories ...
  "UI Widgets": [],
};
```

---

## 2. Tools Index — `apps/mesh/src/tools/index.ts`

### 2.1 Imports

```typescript
import * as UIWidgetTools from "./ui-widgets";
import {
  listUIWidgetResources,
  getUIWidgetResource,
} from "./ui-widgets/resources";
```

If using `RESOURCE_MIME_TYPE` from the SDK for resource registration:

```typescript
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps";
```

### 2.2 CORE_TOOLS array

Add all 28 UI widget tools to the array (after Project tools):

```typescript
  // UI Widget tools (MCP Apps)
  UIWidgetTools.UI_COUNTER,
  UIWidgetTools.UI_METRIC,
  UIWidgetTools.UI_PROGRESS,
  UIWidgetTools.UI_GREETING,
  UIWidgetTools.UI_CHART,
  UIWidgetTools.UI_TIMER,
  UIWidgetTools.UI_STATUS,
  UIWidgetTools.UI_QUOTE,
  UIWidgetTools.UI_SPARKLINE,
  UIWidgetTools.UI_CODE,
  UIWidgetTools.UI_CONFIRMATION,
  UIWidgetTools.UI_JSON_VIEWER,
  UIWidgetTools.UI_TABLE,
  UIWidgetTools.UI_DIFF,
  UIWidgetTools.UI_TODO,
  UIWidgetTools.UI_MARKDOWN,
  UIWidgetTools.UI_IMAGE,
  UIWidgetTools.UI_FORM_RESULT,
  UIWidgetTools.UI_ERROR,
  UIWidgetTools.UI_NOTIFICATION,
  UIWidgetTools.UI_AVATAR,
  UIWidgetTools.UI_SWITCH,
  UIWidgetTools.UI_SLIDER,
  UIWidgetTools.UI_RATING,
  UIWidgetTools.UI_KBD,
  UIWidgetTools.UI_STATS_GRID,
  UIWidgetTools.UI_AREA_CHART,
  UIWidgetTools.UI_CALENDAR,
```

### 2.3 UI widget resource registration

Register UI widget resources on the MCP server inside `managementMCP()`, after tool registration:

```typescript
// Register UI widget resources
const uiResources = listUIWidgetResources();
for (const r of uiResources) {
  const resource = getUIWidgetResource(r.uri);
  if (resource) {
    server.resource(
      r.name,
      r.uri,
      {
        description: r.description,
        mimeType: RESOURCE_MIME_TYPE,
      },
      async () => ({
        contents: [
          {
            uri: r.uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: resource.html,
          },
        ],
      }),
    );
  }
}
```

**Note:** Use `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps` (or `r.mimeType` from `listUIWidgetResources()` if that function already returns the SDK constant). The MIME type must be `text/html;profile=mcp-app` per the MCP Apps spec.

### 2.4 Widget Tool Handler Convention

Widget tools should include `ctx.access.check()` to match the project's convention for MCP tools. Example:

```typescript
handler: async (input, ctx) => {
  await ctx.access.check();
  return {
    message: `Counter "${input.label}" initialized at ${input.initialValue}`,
    _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/counter" },
  };
},
```

If widget tools are exempt from access control (e.g., they are read-only display tools), document the rationale in the tool implementation or in this plan.

---

## 3. Tests

### 3.1 `apps/mesh/src/mcp-apps/types.test.ts`

Test Mesh-specific helpers only (SDK types are not tested here).

**Test cases:**

| Test | Description |
|------|-------------|
| `hasUIResource()` | Returns `true` when `_meta` contains `RESOURCE_URI_META_KEY` (or `UI_RESOURCE_URI_KEY`) with a string value |
| `hasUIResource()` | Returns `false` for null, undefined, non-object, missing key, or non-string value |
| `getUIResourceUri()` | Extracts URI from meta when present |
| `getUIResourceUri()` | Returns `undefined` when meta is null/undefined or key is missing |
| `isUIResourceUri()` | Returns `true` for `ui://` scheme URIs |
| `isUIResourceUri()` | Returns `false` for http, https, file, empty string |
| `MCP_APP_DISPLAY_MODES` | Verify preset dimensions: collapsed (150–300), expanded (300–600), view (400–800), fullscreen (600–1200) |

**Example test structure:**

```typescript
describe("hasUIResource", () => {
  it("should return true when meta has ui/resourceUri string", () => {
    const meta = { "ui/resourceUri": "ui://counter" };
    expect(hasUIResource(meta)).toBe(true);
  });
  it("should return false when meta is null", () => {
    expect(hasUIResource(null)).toBe(false);
  });
  // ...
});

describe("getUIResourceUri", () => {
  it("should return URI when meta has ui/resourceUri", () => {
    const meta = { "ui/resourceUri": "ui://counter" };
    expect(getUIResourceUri(meta)).toBe("ui://counter");
  });
  // ...
});

describe("isUIResourceUri", () => {
  it("should return true for valid UI resource URIs", () => {
    expect(isUIResourceUri("ui://counter")).toBe(true);
    expect(isUIResourceUri("ui://mesh/greeting")).toBe(true);
  });
  it("should return false for non-UI URIs", () => {
    expect(isUIResourceUri("http://example.com")).toBe(false);
  });
});

describe("MCP_APP_DISPLAY_MODES", () => {
  it("should define collapsed mode dimensions", () => {
    expect(MCP_APP_DISPLAY_MODES.collapsed.minHeight).toBe(150);
    expect(MCP_APP_DISPLAY_MODES.collapsed.maxHeight).toBe(300);
  });
  it("should define expanded mode dimensions", () => {
    expect(MCP_APP_DISPLAY_MODES.expanded.minHeight).toBe(300);
    expect(MCP_APP_DISPLAY_MODES.expanded.maxHeight).toBe(600);
  });
  it("should define view mode dimensions", () => {
    expect(MCP_APP_DISPLAY_MODES.view.maxHeight).toBe(800);
  });
  // ...
});
```

### 3.2 `apps/mesh/src/mcp-apps/csp-injector.test.ts`

Port or verify existing tests (~117 lines).

**Test cases:**

| Test | Description |
|------|-------------|
| `DEFAULT_CSP` | Has `default-src 'none'`, allows inline scripts/styles, blocks external connections, prevents framing |
| `injectCSP()` | Inserts meta tag into existing `<head>` |
| `injectCSP()` | Creates `<head>` if missing |
| `injectCSP()` | Works with `<!DOCTYPE html>` |
| `injectCSP()` | Handles uppercase `<HEAD>` tag |
| `injectCSP()` | Uses custom CSP when provided |
| `allowExternalConnections: true` | Sets `connect-src *` when no `allowedHosts` |
| `allowedHosts` | Uses specified hosts in `connect-src` |
| `allowedHosts: []` | Treats empty array as wildcard (`connect-src *`) |
| `allowExternalConnections: false` | Keeps `connect-src 'none'` |

### 3.3 `apps/mesh/src/mcp-apps/resource-loader.test.ts`

Port or verify existing tests (~201 lines).

**Test cases:**

| Test | Description |
|------|-------------|
| `UIResourceLoadError` | Creates error with uri, reason, optional cause |
| `load()` | Fetches and returns HTML with correct MIME type |
| `load()` | Returns raw HTML (CSP injection happens elsewhere) |
| `load()` | Throws when no content returned |
| `load()` | Throws when content has no text |
| `load()` | Throws when resource fetch fails |
| Caching | Caches resources when `cacheTTL > 0` |
| Caching | Respects `cacheTTL` expiration |
| Caching | `clearCache()` clears entries |
| Caching | No cache when `maxCacheSize: 0` |
| MIME type | Use `RESOURCE_MIME_TYPE` for validation where applicable |
| Multiple resources | Loads different URIs separately |

### 3.4 Integration test for AppBridge renderer (optional)

**Defer if complex.** If implemented:

- Mock an iframe and verify PostMessageTransport connection
- Verify `ui/initialize` handshake
- Verify `ui/notifications/tool-input` delivery

---

## 4. Other File Changes

### 4.1 `apps/mesh/src/api/routes/decopilot/helpers.ts`

**Check:** Does the decopilot API need to detect or handle `ui://` resources?

- `toModelOutput` already passes through `_meta` when present (lines 149–151).
- `structuredContent` and `_meta` flow through to the model output.
- **Action:** Review for any special handling of `ui://` URIs. If the AI SDK and chat UI already handle `_meta["ui/resourceUri"]` via MCPAppLoader, no changes may be needed. Document findings.

### 4.2 `apps/mesh/src/tools/code-execution/utils.ts`

**Check:** Does code execution need awareness of UI resources?

- `describeTools()` already includes `uiResourceUri` when `meta?.["ui/resourceUri"]` is present (lines 378–381).
- **Action:** Verify this is sufficient. No changes expected if tools already return `_meta` with the resource URI.

---

## 5. Verification Checklist

After all steps complete, run:

```bash
# Type check
bun run check

# Format (ALWAYS run before committing)
bun run fmt

# Lint
bun run lint

# Run tests
bun test

# Start dev server and verify
bun run dev
```

**Manual verification:**

- [ ] Open chat, invoke a UI widget tool (e.g. `UI_COUNTER`), verify widget renders
- [ ] Expand/collapse widget in chat
- [ ] Open connection Resources tab, verify UI widget resources are listed and preview works

---

## 6. File Summary — All Files Touched Across Steps 0–5

### New files

| File | Approx. lines |
|-----|----------------|
| `apps/mesh/src/mcp-apps/types.ts` | ~40 |
| `apps/mesh/src/mcp-apps/csp-injector.ts` | ~120 |
| `apps/mesh/src/mcp-apps/csp-injector.test.ts` | ~110 |
| `apps/mesh/src/mcp-apps/resource-loader.ts` | ~200 |
| `apps/mesh/src/mcp-apps/resource-loader.test.ts` | ~200 |
| `apps/mesh/src/mcp-apps/mcp-app-renderer.tsx` | ~175 |
| `apps/mesh/src/mcp-apps/types.test.ts` | ~130 |
| `apps/mesh/src/tools/ui-widgets/**` | 28 tools + resources + index |
| `apps/mesh/src/web/components/chat/message/parts/use-ui-resource-loader.ts` | ~35 |
| `apps/mesh/src/web/components/chat/message/parts/mcp-app-loader.tsx` | ~230 |

### Modified files

| File | Changes |
|------|---------|
| `apps/mesh/package.json` | Add `@modelcontextprotocol/ext-apps` dep |
| `apps/mesh/src/tools/registry.ts` | Add UI Widgets category, 28 tools |
| `apps/mesh/src/tools/index.ts` | Import + register tools + resources |
| `apps/mesh/src/web/components/chat/message/parts/tool-call-part/generic.tsx` | MCP App rendering integration (~80 lines) |
| `apps/mesh/src/web/components/details/connection/resources-tab.tsx` | UI resource preview (~170 lines) |
| `apps/mesh/src/api/routes/decopilot/helpers.ts` | Only if `ui://` handling needed |
| `apps/mesh/src/tools/code-execution/utils.ts` | Only if UI resource awareness needed |

### Line count comparison

| Metric | Old custom | New SDK-based |
|--------|------------|---------------|
| Lines added | ~5,500 | ~3,650 (est.) |
| Reduction | — | ~1,850 lines (34%) |
| Main savings | — | MCPAppModel (512→0), types (385→40), renderer (223→175), shared useUIResourceLoader hook |

---

## 7. Implementation Order

1. **Registry** — Add/verify ToolCategory, ALL_TOOL_NAMES, MANAGEMENT_TOOLS, TOOL_LABELS, getToolsByCategory
2. **Tools index** — Add imports, CORE_TOOLS entries, resource registration with RESOURCE_MIME_TYPE
3. **Tests** — types.test.ts, csp-injector.test.ts, resource-loader.test.ts
4. **Other files** — Review decopilot helpers and code-execution utils
5. **Verification** — Run check, fmt, lint, test, dev

---

## 8. Dependencies

- Step 0: SDK installed
- Step 1: Types/helpers (`RESOURCE_MIME_TYPE`, `RESOURCE_URI_META_KEY`)
- Step 2: AppBridge renderer
- Step 3: Widget tools and HTML resources
- Step 4: MCP App loader UI integration

---

## Critique Decisions

**Adopted:**
- Fixed `MCP_APP_DISPLAY_MODES` test assertions to match Step 1 numeric values (Testing, Correctness critics)
- Added `ctx.access.check()` convention note for widget tools (Architecture critic)
- Use `getToolUiResourceUri` from SDK instead of custom helpers where applicable (Documentation critic)
- Shared `useUIResourceLoader` hook to eliminate resource loading duplication (Duplication, Performance critics)
- Shared module-level `UIResourceLoader` singleton for cache reuse (Performance critic)

**Rejected (with reason):**
- "Reduce to 10 widgets for MVP" (Scope critic) — All 28 widgets are already written and tested; shipping all at once is low-risk and provides better demo value. Can always hide via UI if needed.
- "Defer Resources tab preview" (Scope critic) — The resources tab integration is ~180 lines and demonstrates the full MCP Apps capability. It's worth including.
- "Defer developer mode" (Scope critic) — Developer mode is already used in the existing chat UI patterns; removing it would regress the developer experience.
- "Auto-derive tool registry from single source" (Duplication critic) — The existing pattern in the codebase uses explicit entries in 4 places; changing this pattern is a larger refactor that should be done repo-wide, not just for UI widgets.

**Adapted:**
- "Widget HTML script boilerplate" (Duplication critic) — Instead of a shared bootstrap script (which adds loading complexity), we'll document the pattern clearly and keep inline scripts. The boilerplate per widget is ~15 lines which is acceptable for self-contained widgets.
- "CSP injection escaping" (Security critic) — We only use `DEFAULT_CSP` (hardcoded) or validated domain lists; never arbitrary user strings. Added a note that custom CSP should be validated if the feature is extended.

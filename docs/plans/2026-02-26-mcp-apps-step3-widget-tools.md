# Implementation Plan: MCP Apps Step 3 — UI Widget Tools & HTML Resources

**Date:** 2026-02-26  
**Status:** Draft  
**Context:** Reimplementing MCP Apps support using `@modelcontextprotocol/ext-apps` SDK. Step 3 creates/updates the 28 UI widget tools and their HTML resources.

## Overview

Step 3 updates the UI widget tools and HTML resources to use SDK constants and spec-compliant postMessage protocol. The old implementation had tool input bundled in `ui/initialize` params; the spec requires tool arguments via `ui/notifications/tool-input` after initialization.

## Prerequisites

- Step 0: SDK installed (`@modelcontextprotocol/ext-apps`)
- Step 1: Types/helpers layer (`RESOURCE_MIME_TYPE`, `RESOURCE_URI_META_KEY` re-exports)
- Step 2: AppBridge integration for Host-side rendering (receives `ui/initialize` from View; sends `ui/notifications/tool-input` after init)

---

## 1. Widget Tool Definitions — `apps/mesh/src/tools/ui-widgets/`

### 1.1 Changes per tool file

Each of the 28 widget tools follows the same pattern. **Changes needed:**

1. **Import `RESOURCE_URI_META_KEY`** from `@modelcontextprotocol/ext-apps` (or from `@/mcp-apps/types` if re-exported there)
2. **Replace hardcoded `"ui/resourceUri"`** with `{ [RESOURCE_URI_META_KEY]: "ui://mesh/<widget>" }` in the handler's `_meta` return value

### 1.2 Example: counter.ts (before → after)

**Before:**
```typescript
import { z } from "zod";
import { defineTool } from "../../core/define-tool";

export const UI_COUNTER = defineTool({
  name: "UI_COUNTER",
  description: "Display an interactive counter widget with increment/decrement controls",
  inputSchema: z.object({
    initialValue: z.coerce.number().default(0).describe("Initial counter value"),
    label: z.string().default("Counter").describe("Label for the counter"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      message: `Counter "${input.label}" initialized at ${input.initialValue}`,
      _meta: { "ui/resourceUri": "ui://mesh/counter" },
    };
  },
});
```

**After:**
```typescript
import { z } from "zod";
import { RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps";
import { defineTool } from "../../core/define-tool";

export const UI_COUNTER = defineTool({
  name: "UI_COUNTER",
  description: "Display an interactive counter widget with increment/decrement controls",
  inputSchema: z.object({
    initialValue: z.coerce.number().default(0).describe("Initial counter value"),
    label: z.string().default("Counter").describe("Label for the counter"),
  }),
  outputSchema: z.object({
    message: z.string(),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
  handler: async (input) => {
    return {
      message: `Counter "${input.label}" initialized at ${input.initialValue}`,
      _meta: { [RESOURCE_URI_META_KEY]: "ui://mesh/counter" },
    };
  },
});
```

### 1.3 Tool files to update (28 total)

| File | URI | File | URI |
|------|-----|------|-----|
| counter.ts | ui://mesh/counter | metric.ts | ui://mesh/metric |
| progress.ts | ui://mesh/progress | greeting.ts | ui://mesh/greeting |
| chart.ts | ui://mesh/chart | timer.ts | ui://mesh/timer |
| status.ts | ui://mesh/status | quote.ts | ui://mesh/quote |
| sparkline.ts | ui://mesh/sparkline | code.ts | ui://mesh/code |
| confirmation.ts | ui://mesh/confirmation | json-viewer.ts | ui://mesh/json-viewer |
| table.ts | ui://mesh/table | diff.ts | ui://mesh/diff |
| todo.ts | ui://mesh/todo | markdown.ts | ui://mesh/markdown |
| image.ts | ui://mesh/image | form-result.ts | ui://mesh/form-result |
| error.ts | ui://mesh/error | notification.ts | ui://mesh/notification |
| avatar.ts | ui://mesh/avatar | switch.ts | ui://mesh/switch |
| slider.ts | ui://mesh/slider | rating.ts | ui://mesh/rating |
| kbd.ts | ui://mesh/kbd | stats-grid.ts | ui://mesh/stats-grid |
| area-chart.ts | ui://mesh/area-chart | calendar.ts | ui://mesh/calendar |

### 1.4 What stays the same

- Tool names, descriptions, input/output schemas
- Handler logic (except `_meta` key)
- Barrel export in `index.ts`
- No `ctx` / `MeshContext` needed for these tools (they are stateless display tools)

---

## 2. Widget HTML Resources — `apps/mesh/src/tools/ui-widgets/resources.ts`

### 2.1 Spec compliance: method name changes

The MCP Apps spec (SEP-1865, 2026-01-26) defines a **View-initiated** flow:

| Method | Direction | Notes |
|--------|-----------|-------|
| `ui/initialize` | View → Host (request) | View sends on load; Host responds with `McpUiInitializeResult` (protocolVersion, hostCapabilities, hostInfo, hostContext) |
| `ui/notifications/initialized` | View → Host | View sends after receiving init response |
| `ui/notifications/tool-input` | Host → View | Host sends tool arguments (`params.arguments`) after init |
| `ui/notifications/tool-result` | Host → View | Host sends tool execution result |

**Critical change:** The old widgets received tool input via `msg.params?.toolInput` inside the `ui/initialize` request. Per the spec, the Host sends tool arguments via `ui/notifications/tool-input` **after** initialization. The params use `arguments` (not `toolInput`).

### 2.2 Updated widget script pattern

Each widget's inline `<script>` must:

1. **On load, SEND `ui/initialize`** to parent (Host)
2. **Wait for the response** (matching `id`) to get hostContext
3. **Send `ui/notifications/initialized`** notification
4. **Listen for `ui/notifications/tool-input`** — Extract `msg.params?.arguments` and render
5. **Listen for `ui/notifications/tool-result`** — Update UI with tool execution result (if applicable)

**Template for widget scripts:**

```html
<script>
  let requestId = 1;

  function applyArguments(args) {
    // Widget-specific: update DOM from args
  }

  window.addEventListener('message', e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    // Handle init response (Host responds to our ui/initialize)
    if (msg.id === 1 && msg.result) {
      // Initialization succeeded — send initialized notification
      parent.postMessage(JSON.stringify({
        jsonrpc: '2.0',
        method: 'ui/notifications/initialized',
        params: {}
      }), '*');
    }

    // Handle tool-input notification (Host sends after init)
    if (msg.method === 'ui/notifications/tool-input') {
      const args = msg.params?.arguments || {};
      applyArguments(args);
    }

    // Handle tool-result notification
    if (msg.method === 'ui/notifications/tool-result') {
      const result = msg.params;
      // Update UI with result if needed
    }
  });

  // Send ui/initialize request to Host on load
  parent.postMessage(JSON.stringify({
    jsonrpc: '2.0',
    id: requestId++,
    method: 'ui/initialize',
    params: {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'Widget Name', version: '1.0.0' },
      appCapabilities: {}
    }
  }), '*');
</script>
```

### 2.3 Per-widget migration

For each of the 28 widgets in `UI_WIDGET_RESOURCES`:

1. **Extract render logic** — Move the current init body into an `applyArguments(args)` (or equivalent) function
2. **Send `ui/initialize` on load** — Use `protocolVersion: '2026-01-26'`, `appInfo`, and `appCapabilities: {}`
3. **On init response** — Send `ui/notifications/initialized` notification
4. **Add `ui/notifications/tool-input` handler** — Call `applyArguments(msg.params?.arguments || {})`
5. **Add `ui/notifications/tool-result` handler** — For widgets that display tool output (e.g. form-result, confirmation)

### 2.4 Method names reference (spec)

| Method | Direction | Purpose |
|--------|-----------|---------|
| `ui/initialize` | View → Host (request) | View initiates handshake on load |
| `ui/initialize` response | Host → View | Host responds with McpUiInitializeResult (protocolVersion, hostCapabilities, hostInfo, hostContext) |
| `ui/notifications/initialized` | View → Host | View signals init complete after receiving response |
| `ui/notifications/tool-input` | Host → View | Tool arguments (`params.arguments`) |
| `ui/notifications/tool-input-partial` | Host → View | Streaming args (optional) |
| `ui/notifications/tool-result` | Host → View | Tool execution result |
| `ui/notifications/tool-cancelled` | Host → View | Tool was cancelled |

### 2.5 What stays the same in resources.ts

- Design tokens (`tokens` object)
- Base CSS (`baseCSS`)
- `UIWidgetResource` interface
- `UI_WIDGET_RESOURCES` structure (uri → { name, description, html, exampleInput })
- `getUIWidgetResource()` and `listUIWidgetResources()` exports
- HTML structure, styles, and widget-specific DOM for each widget
- `exampleInput` for each resource (used by resources tab preview)

### 2.6 Raw postMessage vs SDK App class

The SDK provides an `App` class for building complex views. For simple inline widgets, **raw postMessage with spec-compliant method names is sufficient**. No need to load the SDK inside the iframe. The widgets are self-contained HTML with inline CSS and JS.

---

## 3. Resource Registration — `apps/mesh/src/tools/index.ts`

### 3.1 Changes

- Import `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps` (or `@/mcp-apps/types`)
- Use `RESOURCE_MIME_TYPE` instead of hardcoded `"text/html;profile=mcp-app"` when registering resources

### 3.2 Current code (excerpt)

```typescript
const uiResources = listUIWidgetResources();
for (const r of uiResources) {
  const resource = getUIWidgetResource(r.uri);
  if (resource) {
    server.resource(
      r.name,
      r.uri,
      { description: r.description, mimeType: r.mimeType },
      async () => ({
        contents: [{ uri: r.uri, mimeType: r.mimeType, text: resource.html }],
      }),
    );
  }
}
```

### 3.3 Options

**Option A — Use from listUIWidgetResources:**  
`listUIWidgetResources()` already returns `mimeType: "text/html;profile=mcp-app"`. Update that function to use `RESOURCE_MIME_TYPE`:

```typescript
// In resources.ts
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps";

export function listUIWidgetResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  exampleInput: Record<string, unknown>;
}> {
  return Object.entries(UI_WIDGET_RESOURCES).map(([uri, resource]) => ({
    uri,
    name: resource.name,
    description: resource.description,
    mimeType: RESOURCE_MIME_TYPE,
    exampleInput: resource.exampleInput,
  }));
}
```

**Option B — Override in index.ts:**  
Keep `listUIWidgetResources` as-is and pass `RESOURCE_MIME_TYPE` when registering. Prefer Option A for single source of truth.

---

## 4. File Structure

```
apps/mesh/src/tools/ui-widgets/
├── index.ts           # Barrel exports (unchanged structure)
├── resources.ts      # ~1700 lines, widget HTML with updated script pattern
├── counter.ts
├── metric.ts
├── progress.ts
├── greeting.ts
├── chart.ts
├── timer.ts
├── status.ts
├── quote.ts
├── sparkline.ts
├── code.ts
├── confirmation.ts
├── json-viewer.ts
├── table.ts
├── diff.ts
├── todo.ts
├── markdown.ts
├── image.ts
├── form-result.ts
├── error.ts
├── notification.ts
├── avatar.ts
├── switch.ts
├── slider.ts
├── rating.ts
├── kbd.ts
├── stats-grid.ts
├── area-chart.ts
└── calendar.ts
```

---

## 5. Implementation Order

1. Add `RESOURCE_MIME_TYPE` to `listUIWidgetResources()` in `resources.ts` (if not already using constant)
2. Update all 28 widget tool files to use `RESOURCE_URI_META_KEY`
3. Update `resources.ts` — for each widget HTML:
   - Refactor script to `applyArguments(args)` pattern
   - Send `ui/initialize` on load; handle init response; send `ui/notifications/initialized`
   - Add `ui/notifications/tool-input` handler
   - Add `ui/notifications/tool-result` handler where needed
4. Verify `index.ts` uses `RESOURCE_MIME_TYPE` (via `listUIWidgetResources` or direct import)
5. Run `bun run fmt`, `bun run check`, `bun test`

---

## 6. Verification Checklist

- [ ] All 28 tools use `RESOURCE_URI_META_KEY` instead of hardcoded `"ui/resourceUri"`
- [ ] All 28 widget scripts handle `ui/notifications/tool-input` with `msg.params.arguments`
- [ ] All widget scripts send `ui/initialize` on load, handle init response, and send `ui/notifications/initialized`
- [ ] `listUIWidgetResources()` returns `mimeType: RESOURCE_MIME_TYPE`
- [ ] `bun run check` passes
- [ ] `bun run fmt` applied
- [ ] Manual test: Load a widget in chat, verify it receives and renders tool arguments

---

## 7. Dependencies on Step 2

Step 3 assumes the Host (AppBridge / MCPAppModel) in Step 2:

- **Receives** `ui/initialize` from the View (View-initiated flow; AppBridge does not send init)
- Responds with `McpUiInitializeResult` (protocolVersion, hostCapabilities, hostInfo, hostContext)
- Receives `ui/notifications/initialized` from the View
- Sends `ui/notifications/tool-input` with `arguments` **after** init completes
- Sends `ui/notifications/tool-result` when tool execution completes

---

## 8. Summary: What Changes vs What Stays

| Area | Changes | Stays Same |
|------|---------|------------|
| Tool files | Use `RESOURCE_URI_META_KEY` for `_meta` | Schemas, handler logic, structure |
| Widget HTML | Add `tool-input` handler, use `arguments` | Tokens, base CSS, DOM structure |
| resources.ts | `RESOURCE_MIME_TYPE`, script pattern | Resource map, exports, exampleInput |
| index.ts | MIME type from constant | Registration loop, tool list |

---

## Critique Decisions

**Adopted:**
- Fixed `ui/initialize` to View-initiated flow (Correctness, Documentation critics) — widgets SEND init on load, not listen for it
- Removed legacy `toolInput` backward compat (Scope critic) — no legacy Host exists after reset
- Spec-compliant `ui/notifications/initialized` notification after init (Documentation critic)

**Rejected (with reason):**
- "Shared bootstrap script for widget scripts" (Duplication critic) — Adds loading complexity for inline widgets; ~15 lines of boilerplate per widget is acceptable for self-contained HTML
- "Reduce to 10 widgets" (Scope critic) — All 28 are already designed; shipping all provides better demo value

**Adapted:**
- "Use `createUIWidgetTool` factory" (Duplication critic) — Considered but deferred; the current `defineTool` pattern is consistent with the rest of the codebase. Can refactor later if widget count grows.

# Implementation Plan: MCP Apps Step 4 — Chat UI & Resources Tab Integration

**Date:** 2026-02-26  
**Status:** Draft  
**Depends on:** Step 0 (SDK), Step 1 (types, CSP, resource loader), Step 2 (MCPAppRenderer), Step 3 (widget tools)

## Overview

Step 4 integrates MCP Apps into the Mesh web UI at two points:

1. **Chat UI** — Show MCP App views inline in chat messages when a tool returns a `ui://` resource
2. **Resources tab** — Preview MCP App resources in the connection detail view

After Steps 1–3, we have:

- SDK-based types re-exports in `mcp-apps/types.ts`
- CSP injector and resource loader in `mcp-apps/`
- AppBridge-based `MCPAppRenderer` component in `mcp-apps/mcp-app-renderer.tsx`
- 28 UI widget tools with spec-compliant HTML resources

---

## 1.0 Shared Hook: useUIResourceLoader

**File:** `apps/mesh/src/web/components/chat/message/parts/use-ui-resource-loader.ts` (or co-located with MCPAppLoader)  
**Target:** ~35 lines

### Purpose

Extract the repeated `queueMicrotask + ref + UIResourceLoader + injectCSP` pattern into a shared hook. Use a module-level `UIResourceLoader` singleton for cache sharing across MCPAppLoader and UIAppPreview.

### Implementation

```typescript
const sharedLoader = new UIResourceLoader(); // module-level singleton

function useUIResourceLoader(uri: string, readResource: ReadResourceFn) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadStartedRef = useRef(false);

  if (!loadStartedRef.current && !html && !loading && !error) {
    loadStartedRef.current = true;
    queueMicrotask(() => {
      setLoading(true);
      (async () => {
        try {
          const content = await sharedLoader.load(uri, readResource);
          setHtml(injectCSP(content.html));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load app");
        } finally {
          setLoading(false);
        }
      })();
    });
  }

  return { html, loading, error };
}
```

---

## 1. MCPAppLoader Component

**File:** `apps/mesh/src/web/components/chat/message/parts/mcp-app-loader.tsx`  
**Target:** ~230 lines (uses `useUIResourceLoader` hook)

### Purpose

Renders MCP Apps inline in chat messages. Loads the resource HTML via `UIResourceLoader`, injects CSP, and renders `MCPAppRenderer` with `callTool`/`readResource` proxied through `useMCPClient()`.

### Props Interface

```typescript
interface MCPAppLoaderProps {
  /** The ui:// resource URI */
  uiResourceUri: string;
  /** Connection ID to proxy calls through */
  connectionId: string;
  /** Organization ID */
  orgId: string;
  /** Tool name that triggered this */
  toolName: string;
  /** Friendly display name */
  friendlyName: string;
  /** Tool arguments */
  toolInput: unknown;
  /** Tool execution result */
  toolResult: unknown;
  /** Minimum height (default: MCP_APP_DISPLAY_MODES.collapsed.minHeight) */
  minHeight?: number;
  /** Maximum height (default: MCP_APP_DISPLAY_MODES.collapsed.maxHeight) */
  maxHeight?: number;
  /** Additional CSS class */
  className?: string;
  /** Developer mode — different header ("Interactive App" vs friendly name) */
  developerMode?: boolean;
  /** First in sequence — spacing adjustment */
  isFirstInSequence?: boolean;
}
```

### Key Implementation Details

#### 1.1 Suspense Requirement

`useMCPClient()` from `@decocms/mesh-sdk` uses Suspense internally. **MCPAppLoader must be rendered inside a `<Suspense>` boundary** (provided by the caller in `generic.tsx`).

#### 1.2 MCP Client & Proxies

```typescript
const mcpClient = useMCPClient({ connectionId, orgId });

const readResource = async (uri: string): Promise<ReadResourceResult> => {
  const result = await mcpClient.readResource({ uri });
  return { contents: result.contents };
};

const callTool = async (
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> => {
  const result = await mcpClient.callTool({ name, arguments: args });
  return result; // MCP client returns CallToolResult-compatible shape
};
```

Map mesh client results to SDK `CallToolResult`/`ReadResourceResult` if needed. The mesh MCP client typically returns compatible shapes.

#### 1.3 Deferred Loading (No useEffect)

Use the shared `useUIResourceLoader` hook (section 1.0) instead of inline loading logic:

```typescript
const { html: appHtml, loading: appLoading, error: appError } = useUIResourceLoader(
  uiResourceUri,
  readResource,
);
```

#### 1.4 Expand/Collapse Toggle

Use `MCP_APP_DISPLAY_MODES.collapsed` and `MCP_APP_DISPLAY_MODES.expanded` for height presets:

```typescript
const [isExpanded, setIsExpanded] = useState(false);

const currentMinHeight = isExpanded
  ? MCP_APP_DISPLAY_MODES.expanded.minHeight
  : minHeight ?? MCP_APP_DISPLAY_MODES.collapsed.minHeight;
const currentMaxHeight = isExpanded
  ? MCP_APP_DISPLAY_MODES.expanded.maxHeight
  : maxHeight ?? MCP_APP_DISPLAY_MODES.collapsed.maxHeight;
```

#### 1.5 Display Modes

| Mode       | minHeight | maxHeight |
|------------|-----------|-----------|
| collapsed  | 150       | 300       |
| expanded   | 300       | 600       |
| view       | 400       | 800       |
| fullscreen | 600       | 1200      |

(Values from Step 1 plan; all numeric.)

#### 1.6 UI States

| State   | Behavior |
|---------|----------|
| Loading | Spinner in developer mode; shimmer + "Loading {friendlyName}..." in normal mode |
| Error   | Bordered container with error message |
| Loaded  | Header (friendly name + LayersTwo01 icon, or "Interactive App" in dev) + expand button + MCPAppRenderer |

#### 1.7 CSP Injection

Call `injectCSP(content.html)` from `mcp-apps/csp-injector.ts` before passing HTML to `MCPAppRenderer`.

#### 1.8 MCPAppRenderer Props

Pass through:

- `html` (CSP-injected)
- `uri`
- `toolName`, `toolInput`, `toolResult`
- `minHeight`, `maxHeight` (from expand state)
- `callTool`, `readResource`
- `className`

**Note:** Step 2 `MCPAppRenderer` does **not** take `connectionId`; it receives `callTool` and `readResource` directly.

---

## 2. Chat Message Tool Call Detection

**File:** `apps/mesh/src/web/components/chat/message/parts/tool-call-part/generic.tsx`  
**Change:** ~80 lines added/modified

### Purpose

Detect when a tool result contains a `ui://` resource and render `MCPAppLoader` instead of the default text output.

### Detection Logic

```typescript
import { getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";
import { MCPAppLoader } from "../mcp-app-loader.tsx";

// Inside GenericToolCallPart, when part.state === "output-available":
const toolOutput = part.output;
const uiResourceUri = getToolUiResourceUri(toolOutput); // handles _meta.ui.resourceUri and _meta["ui/resourceUri"]

// connectionId: from tool _meta.connectionId or selectedVirtualMcp?.id
const toolMeta =
  toolOutput &&
  typeof toolOutput === "object" &&
  "_meta" in toolOutput
    ? (toolOutput as Record<string, unknown>)._meta
    : undefined;

const connectionId =
  toolMeta &&
  typeof toolMeta === "object" &&
  toolMeta !== null &&
  "connectionId" in (toolMeta as Record<string, unknown>)
    ? String((toolMeta as Record<string, unknown>).connectionId)
    : selectedVirtualMcp?.id ?? null;

const hasMCPApp = !!uiResourceUri && part.state === "output-available";
const canRenderMCPApp = hasMCPApp && !!connectionId && !!org?.id;
```

### Conditional Rendering

```typescript
// When canRenderMCPApp is true:
<Suspense
  fallback={
    <div className="flex items-center justify-center h-32 border border-border rounded-lg">
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading app...</span>
      </div>
    </div>
  }
>
  <MCPAppLoader
    uiResourceUri={uiResourceUri!}
    connectionId={connectionId!}
    orgId={org!.id}
    toolName={toolName}
    friendlyName={friendlyName}
    toolInput={part.input}
    toolResult={part.output}
    minHeight={150}
    maxHeight={400}
    className="border border-border rounded-lg"
  />
</Suspense>
```

### Detail/Output Display

When `hasMCPApp` is true, **do not** include the raw tool output in `detail`. The MCP App replaces it. When `hasMCPApp` is false, keep the existing `# Output` section.

```typescript
} else if (part.output !== undefined && !hasMCPApp) {
  if (detail) detail += "\n\n";
  detail += "# Output\n" + safeStringifyFormatted(part.output);
}
```

### Icon

Use `LayersTwo01` when `hasMCPApp`, `Atom02` otherwise (for ToolCallShell icon).

---

## 3. Resources Tab Integration

**File:** `apps/mesh/src/web/components/details/connection/resources-tab.tsx`  
**Change:** ~170 lines added

### Purpose

- Detect `ui://` resources in the resource list
- Show a dedicated "UI Apps" section with preview cards
- On click, show an inline preview panel with `MCPAppRenderer`

### 3.1 UI Resource Detection

```typescript
import { isUIResourceUri } from "@/mcp-apps/types.ts";

const uiResources = resources?.filter((r) => isUIResourceUri(r.uri)) ?? [];
const regularResources = resources?.filter((r) => !isUIResourceUri(r.uri)) ?? [];
```

### 3.2 UIAppsSection Component (~50 lines)

Renders a grid of cards for `ui://` resources. Each card shows:

- LayersTwo01 icon
- Resource name (or URI without `ui://`)
- Description (if present)
- Click handler: `onAppClick(resource)` → sets preview state

```typescript
function UIAppsSection({
  uiResources,
  onAppClick,
}: {
  uiResources: McpResource[];
  onAppClick: (resource: McpResource) => void;
}) {
  if (uiResources.length === 0) return null;

  return (
    <div className="border-b border-border pb-4 mb-4">
      <div className="flex items-center gap-2 mb-3 px-5 pt-4">
        <LayersTwo01 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">UI Apps</h3>
        <span className="text-xs text-muted-foreground">({uiResources.length})</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-5">
        {uiResources.map((resource) => (
          <Card
            key={resource.uri}
            className="cursor-pointer transition-colors hover:bg-accent/50"
            onClick={() => onAppClick(resource)}
          >
            {/* Card content */}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### 3.3 UIAppPreview Component (~130 lines)

Inline preview panel that takes over the view when a UI app is selected.

**Props:**

```typescript
interface UIAppPreviewProps {
  resource: McpResource;
  connectionId: string;
  readResource: (uri: string) => Promise<ReadResourceResult>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
  onClose: () => void;
}
```

**Implementation:**

1. **useMCPClient** — Not needed; `readResource` and `callTool` are passed from parent `ResourcesTab`, which uses `useMCPClient`.
2. **Deferred load** — Use the shared `useUIResourceLoader` hook (section 1.0) instead of inline loading logic.
3. **Header** — Resource name + LayersTwo01 icon + close button (XClose)
4. **Content** — Loading spinner, error state, or `MCPAppRenderer` when loaded
5. **Display mode** — Use `MCP_APP_DISPLAY_MODES.view` or `displayMode="fullscreen"` for preview dimensions

```typescript
<MCPAppRenderer
  html={html}
  uri={resource.uri}
  displayMode="fullscreen"
  minHeight={MCP_APP_DISPLAY_MODES.view.minHeight}
  maxHeight={MCP_APP_DISPLAY_MODES.view.maxHeight}
  callTool={callTool}
  readResource={handleReadResource}
  toolInput={getUIWidgetResource(resource.uri)?.exampleInput}
  className="border border-border rounded-lg"
/>
```

**Note:** `getUIWidgetResource(resource.uri)?.exampleInput` provides example input for built-in widgets when previewing from the resources tab (no tool execution context).

### 3.4 ResourcesTab Flow

```typescript
export function ResourcesTab({ resources, connectionId, org }: ResourcesTabProps) {
  const mcpClient = useMCPClient({ connectionId, orgId: org });
  const [previewApp, setPreviewApp] = useState<McpResource | null>(null);

  const uiResources = resources?.filter((r) => isUIResourceUri(r.uri)) ?? [];
  const regularResources = resources?.filter((r) => !isUIResourceUri(r.uri)) ?? [];

  const handleReadResource = async (uri: string) => { /* ... */ };
  const handleCallTool = async (name: string, args: Record<string, unknown>) => { /* ... */ };

  // When previewing, show full-screen preview
  if (previewApp && mcpClient) {
    return (
      <UIAppPreview
        resource={previewApp}
        connectionId={connectionId}
        readResource={handleReadResource}
        callTool={handleCallTool}
        onClose={() => setPreviewApp(null)}
      />
    );
  }

  return (
    <>
      {uiResources.length > 0 && (
        <UIAppsSection uiResources={uiResources} onAppClick={setPreviewApp} />
      )}
      <ResourcesList
        resources={regularResources}
        connectionId={connectionId}
        org={org}
        connectionTitle={connection?.title}
        connectionIcon={connection?.icon}
        emptyMessage={
          uiResources.length > 0
            ? "No other resources available."
            : "This connection doesn't have any resources yet."
        }
      />
    </>
  );
}
```

### 3.5 Type Compatibility

`handleCallTool` and `handleReadResource` must return types compatible with `MCPAppRenderer`:

- `callTool` → `Promise<CallToolResult>` (from `@modelcontextprotocol/sdk/types.js`)
- `readResource` → `Promise<ReadResourceResult>`

Map mesh MCP client results if the shapes differ. The SDK `CallToolResult` typically has `content` and `isError`; `ReadResourceResult` has `contents`.

---

## 4. File Structure

```
apps/mesh/src/web/components/
├── chat/message/parts/
│   ├── use-ui-resource-loader.ts  (~35 lines) — NEW shared hook
│   ├── mcp-app-loader.tsx         (~230 lines) — NEW or REPLACE
│   └── tool-call-part/
│       └── generic.tsx            (modified, ~80 lines added)
└── details/connection/
    └── resources-tab.tsx          (modified, ~170 lines added)
```

---

## 5. Key Dependencies

### From Step 1

- `hasUIResource(meta)` — Type guard for meta with UI resource
- `isUIResourceUri(uri)` — Check if URI starts with `ui://`
- `MCP_APP_DISPLAY_MODES` — Dimension presets
- `injectCSP(html)` — from `mcp-apps/csp-injector.ts`
- `UIResourceLoader` — from `mcp-apps/resource-loader.ts`
- `UIResourceLoadError` — from `mcp-apps/resource-loader.ts`

### From Step 2

- `MCPAppRenderer` — AppBridge-based renderer with props:
  - `html`, `uri`, `toolName`, `toolInput`, `toolResult`
  - `displayMode`, `minHeight`, `maxHeight`
  - `callTool`, `readResource`
  - `onMessage?`, `className?`

### From Step 3

- Widget resources registered with `ui://mesh/<widget>` URIs
- `getUIWidgetResource(uri)` — for `exampleInput` in resources tab preview

### From mesh-sdk

- `useMCPClient({ connectionId, orgId })` — Requires Suspense boundary
- `useProjectContext()` — For `org`

### From SDK (`@modelcontextprotocol/ext-apps/app-bridge`)

- `getToolUiResourceUri(toolOutput)` — Extracts `ui://` URI from tool output; handles both `_meta.ui.resourceUri` and `_meta["ui/resourceUri"]`

### SDK Constants (Reference)

- `RESOURCE_URI_META_KEY` — `"ui/resourceUri"`
- `McpUiDisplayMode` — `"inline" | "fullscreen" | "pip"`

---

## 6. Implementation Order

1. **Create useUIResourceLoader** — `use-ui-resource-loader.ts`
   - Shared hook with module-level UIResourceLoader singleton
   - queueMicrotask + ref + injectCSP pattern

2. **Create MCPAppLoader** — `mcp-app-loader.tsx`
   - Props interface
   - useMCPClient, readResource, callTool adapters
   - useUIResourceLoader for loading
   - Expand/collapse with MCP_APP_DISPLAY_MODES
   - Loading, error, loaded states
   - developerMode vs normal mode headers

3. **Modify generic.tsx** — Tool call part
   - Import getToolUiResourceUri from SDK, MCPAppLoader
   - Extract uiResourceUri and connectionId from tool output
   - Compute hasMCPApp, canRenderMCPApp
   - Conditional MCPAppLoader + Suspense
   - Exclude detail when hasMCPApp
   - LayersTwo01 icon when hasMCPApp

4. **Modify resources-tab.tsx** — Resources tab
   - Import isUIResourceUri, MCP_APP_DISPLAY_MODES, MCPAppRenderer, useUIResourceLoader, getUIWidgetResource
   - Add UIAppsSection
   - Add UIAppPreview (uses useUIResourceLoader)
   - Split uiResources / regularResources
   - Preview state and conditional rendering

5. **Run checks** — `bun run fmt`, `bun run check`, `bun test`

---

## 7. Edge Cases & Notes

### connectionId Source

- Prefer `toolOutput._meta.connectionId` when tool execution is tied to a connection
- Fall back to `selectedVirtualMcp?.id` when using a virtual MCP

### No useEffect

- `queueMicrotask` + ref for load-once is correct
- No `useEffect` for loading or cleanup

### Resources Tab useMCPClient

- `useMCPClient` must be called unconditionally (Suspense)
- `ResourcesTab` is already wrapped in a route that provides Suspense, or the parent handles it

### Example Input for Resources Tab

- `getUIWidgetResource(resource.uri)?.exampleInput` provides sample data for built-in widgets
- For external `ui://` resources, `toolInput` may be `undefined`; the app should handle that

### Error Display

- MCPAppLoader: bordered container with error message
- UIAppPreview: centered error with "Failed to load app" + message

---

## 8. Verification Checklist

- [ ] MCPAppLoader renders in chat when tool returns `_meta` with `ui/resourceUri`
- [ ] Expand/collapse works with correct height presets
- [ ] Loading state shows spinner (dev) or shimmer (normal)
- [ ] Error state shows message in bordered container
- [ ] generic.tsx does not show raw output when MCP App is rendered
- [ ] Resources tab shows "UI Apps" section when connection has `ui://` resources
- [ ] Clicking a UI app opens inline preview
- [ ] Preview close button returns to resource list
- [ ] `bun run check` passes
- [ ] `bun run fmt` applied
- [ ] No `useEffect` used
- [ ] `useMCPClient` callers wrapped in Suspense

---

## 9. Summary

| Component | Location | Size | Purpose |
|-----------|----------|------|---------|
| useUIResourceLoader | chat/message/parts/use-ui-resource-loader.ts | ~35 | Shared hook for load + CSP injection |
| MCPAppLoader | chat/message/parts/mcp-app-loader.tsx | ~230 | Load + render MCP App in chat |
| generic.tsx | tool-call-part/generic.tsx | +80 | Detect ui://, render MCPAppLoader |
| UIAppsSection | resources-tab.tsx | ~50 | Grid of UI app cards |
| UIAppPreview | resources-tab.tsx | ~120 | Inline preview panel (uses shared hook) |

**Total:** ~265 new lines (hook + MCPAppLoader) + ~170 modified (generic + resources-tab)

---

## Critique Decisions

**Adopted:**
- Shared `useUIResourceLoader` hook (Duplication, Performance critics) — eliminates repeated loading pattern and ensures cache reuse via module-level singleton
- Use `getToolUiResourceUri` from SDK for tool output detection (Documentation critic) — replaces custom `getUIResourceUri` for this use case
- Numeric display mode dimensions matching Step 1 (Correctness critic)

**Rejected (with reason):**
- "Defer Resources tab preview to post-MVP" (Scope critic) — Only ~170 extra lines; demonstrates full capability and is straightforward with the shared hook
- "Defer developer mode" (Scope critic) — Already part of existing chat UI patterns; removing would regress DX
- "Defer expand/collapse" (Scope critic) — Essential for UX when widgets are in chat messages

**Adapted:**
- "Shared MCPAppLoadingState component" (Duplication critic) — Loading/error UI is similar but not identical between contexts (chat shimmer vs spinner, different copy). Keeping inline for now; extract if a third consumer appears.

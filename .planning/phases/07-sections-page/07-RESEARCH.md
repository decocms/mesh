# Phase 7: Sections Page - Research

**Researched:** 2026-02-15
**Domain:** Block browser UI, JSON Schema visualization, re-scan integration
**Confidence:** HIGH

## Summary

Phase 7 transforms the existing placeholder `sections-list.tsx` and `block-detail.tsx` components into the production-ready Sections Page. The good news: nearly all infrastructure is already built. The block scanner tools (`CMS_BLOCK_LIST`, `CMS_BLOCK_GET`, `CMS_BLOCK_SCAN`) are implemented and working. The client-side `block-api.ts` helpers exist with `listBlocks()` and `getBlock()` functions. The RJSF prop editor (`PropEditor` component with custom templates/widgets) is fully functional. Routes are already registered in `router.ts` (`/sections` and `/sections/$blockId`). Query keys are defined in `query-keys.ts`.

The work is primarily UI refinement and wiring: (1) convert the sections list from the current card-style layout to a table-rows layout grouped by collapsible categories, (2) enhance the block detail view to use a two-column layout with collapsible schema tree on the left and live prop editor on the right, (3) wire the "Scan Codebase" button to actually call `CMS_BLOCK_SCAN` via the server plugin tools, and (4) handle empty/error/malformed states per the user's decisions.

**Primary recommendation:** Refactor the existing `sections-list.tsx` and `block-detail.tsx` in-place. No new files needed for the core functionality. The scan trigger needs a `useMutation` wired to the server-side `CMS_BLOCK_SCAN` tool. The schema tree component is the only genuinely new UI element -- build a recursive collapsible tree that renders JSON Schema properties with type indicators.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Table rows layout -- dense, scannable, data-rich
- Grouped by category (collapsible sections per category, e.g., sections, headers, footers)
- Columns: block name, category tag, component file path
- Clicking a row navigates to a separate detail page (`/sections/:blockId`)
- Two-column layout on detail: collapsible schema tree on the left, live property editor form on the right
- Schema displayed as interactive collapsible tree (expand/collapse nested properties)
- Form preview pre-filled with default prop values from the block definition
- Component file path shown as plain text (no clickable link)
- No blocks scanned: show message + prominent "Scan Codebase" button (scan prompt, not instructions)
- Require active connection before showing scan state -- if no connection, show "Connect your project first"
- Malformed schema: fall back to raw JSON with syntax highlighting + error note (still useful for debugging)
- After re-scan, removed blocks disappear silently -- re-scan replaces the list entirely

### Claude's Discretion
- Re-scan trigger placement and progress feedback UI
- Exact table styling and category collapse behavior
- Schema tree component implementation
- Loading states during scan and data fetch

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **@rjsf/core** | ^6.1.2 (in Mesh) | Render JSON Schema as live editable prop form | Already used in `PropEditor` component with custom templates/widgets |
| **@rjsf/validator-ajv8** | ^6.1.2 (in Mesh) | Validate form data against JSON Schema | Required by RJSF, already installed |
| **@tanstack/react-query** | >=5.0.0 (peer dep) | Data fetching, caching, mutations for block list/detail/scan | Already used throughout plugin for pages, blocks, loaders |
| **@tanstack/react-router** | >=1.0.0 (peer dep) | Route params, navigation between list and detail | Routes already registered in `router.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@radix-ui/react-collapsible** | (in @deco/ui) | Collapsible category groups and schema tree nodes | Via `@deco/ui/components/collapsible.tsx` -- Collapsible, CollapsibleTrigger, CollapsibleContent |
| **@deco/ui** Table components | (workspace) | Table, TableHeader, TableBody, TableRow, TableHead, TableCell | For the dense table-rows layout |
| **@deco/ui** Badge | (workspace) | Category tags in table rows | Already used in current sections-list |
| **lucide-react** | ^0.468.0 (in Mesh) | ChevronDown, ChevronRight, Search, Box, RefreshCw icons | Already used in block-detail and sections-list |
| **@untitledui/icons** | ^0.0.19 (in Mesh) | Loading01, AlertCircle for loading/error states | Already used throughout plugin |
| **sonner** | >=2.0.0 (in Mesh) | Toast notifications for scan success/failure | Already used in pages-list for create/delete feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Radix Collapsible for categories | Simple boolean state toggle | Radix provides accessible expand/collapse with animation support; state toggle works but needs manual ARIA |
| @deco/ui Table for list | Custom button rows (current approach) | Table is the user's locked decision (dense, scannable, data-rich); current card-style layout doesn't match |
| Custom schema tree | react-json-tree or react-json-view | External libraries are overkill for JSON Schema display; a simple recursive component with Collapsible is sufficient and matches the existing pattern |

**Installation:**
```bash
# No new dependencies needed. Everything is already installed.
```

## Architecture Patterns

### Recommended Component Structure
```
packages/mesh-plugin-site-editor/client/
├── components/
│   ├── sections-list.tsx      # REFACTOR: table rows + collapsible categories + scan trigger
│   ├── block-detail.tsx       # REFACTOR: two-column layout + schema tree + prop editor
│   └── schema-tree.tsx        # NEW: recursive collapsible JSON Schema tree
├── lib/
│   ├── block-api.ts           # EXISTS: listBlocks(), getBlock() -- no changes needed
│   ├── query-keys.ts          # EXISTS: blockKeys.all(), blockKeys.detail() -- no changes needed
│   └── router.ts              # EXISTS: /sections, /sections/$blockId -- no changes needed
```

### Pattern 1: Server-Side Scan via useMutation
**What:** The scan trigger calls `CMS_BLOCK_SCAN` through the server plugin tool system, not through the client-side `toolCaller`. The `CMS_BLOCK_SCAN` tool is a `ServerPluginToolDefinition` that runs on the Mesh server, creates an MCP proxy to the site connection, reads source files, runs ts-morph, and writes block definitions back.
**When to use:** Always -- the scan tool needs server-side ts-morph which isn't available in the browser.
**How it works in this codebase:**

The server plugin tools are called differently from client-side SITE_BINDING tools. Looking at how existing mutations work (e.g., `createPage` in `page-api.ts`), the client calls through `toolCaller` which goes through the PluginLayout's MCP proxy. However, `CMS_BLOCK_SCAN` is a **server plugin tool** that takes a `connectionId` parameter and creates its own MCP proxy internally.

To call server plugin tools from the client, the pattern uses `useMCPClient` with `SELF_MCP_ALIAS_ID` (seen in `pages-list.tsx` and `plugin-empty-state.tsx`):

```typescript
const selfClient = useMCPClient({
  connectionId: SELF_MCP_ALIAS_ID,
  orgId: org.id,
});

// Then call the server plugin tool:
const result = await selfClient.callTool({
  name: "CMS_BLOCK_SCAN",
  arguments: { connectionId },
});
```

**Important:** After scan completes, invalidate block query keys to refresh the list:
```typescript
queryClient.invalidateQueries({
  queryKey: blockKeys.all(connectionId),
});
```

### Pattern 2: Collapsible Category Groups with Radix
**What:** Each category in the block list is a collapsible section using the existing `@deco/ui` Collapsible components.
**When to use:** For the grouped-by-category table layout.
**Example:**
```typescript
// Source: packages/ui/src/components/collapsible.tsx
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@deco/ui/components/collapsible.tsx";

// Per-category collapsible group
<Collapsible defaultOpen>
  <CollapsibleTrigger className="...">
    <ChevronDown /> {/* or ChevronRight when collapsed */}
    {category}
    <Badge>{blocks.length}</Badge>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <Table>
      {blocks.map(block => <TableRow>...</TableRow>)}
    </Table>
  </CollapsibleContent>
</Collapsible>
```

### Pattern 3: Recursive Schema Tree Component
**What:** A custom component that renders a JSON Schema as an interactive collapsible tree. Each property node shows its name, type, required status, and description. Object/array nodes can be expanded to show nested properties.
**When to use:** Left column of the block detail view.
**Implementation approach:**
```typescript
interface SchemaTreeProps {
  schema: Record<string, unknown>;
  name?: string;
  depth?: number;
  defaultExpanded?: boolean;
}

function SchemaTree({ schema, name, depth = 0, defaultExpanded = true }: SchemaTreeProps) {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[]) ?? [];
  const type = schema.type as string;

  if (!properties || type !== "object") {
    // Leaf node: show type badge
    return <LeafNode name={name} schema={schema} />;
  }

  // Object node: collapsible with children
  return (
    <Collapsible defaultOpen={defaultExpanded && depth < 2}>
      <CollapsibleTrigger>
        {name} <Badge>{type}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {Object.entries(properties).map(([key, propSchema]) => (
          <SchemaTree
            key={key}
            schema={propSchema}
            name={key}
            depth={depth + 1}
            defaultExpanded={depth < 1}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

### Pattern 4: Connection Guard Before Scan State
**What:** The sections list must check for an active connection before showing the "no blocks" empty state. If no connection exists, show "Connect your project first" instead of "Scan Codebase".
**When to use:** In the empty state conditional rendering.
**How it works:** `usePluginContext` returns `connectionId` which is non-null when a connection is configured. The `PluginLayout` already handles the no-connection case by rendering `renderEmptyState()`, so the sections-list component will always have a valid `connectionId` when it renders. However, the empty state within sections-list (no blocks found) should still be the scan prompt since the connection is guaranteed at that point.

**Critical insight:** Looking at `plugin-layout.tsx`, when there's no configured connection, the layout renders the plugin's `renderEmptyState()` component (the `PluginEmptyState` wizard). The sections-list component only renders inside the `<Outlet />` which is within the connected state. Therefore, `sections-list.tsx` can assume a valid connection always exists and show the scan prompt directly when blocks are empty.

### Pattern 5: Malformed Schema Fallback
**What:** When a block's schema is invalid or can't be rendered by RJSF, fall back to raw JSON display with an error note.
**When to use:** In block-detail when `PropEditor` would crash or schema is not a valid JSON Schema.
**Example:**
```typescript
// Wrap PropEditor in error boundary or try-catch during render
const isValidSchema = schema?.type === "object" && schema?.properties;

{isValidSchema ? (
  <PropEditor schema={schema} formData={formData} onChange={setFormData} />
) : (
  <div>
    <p className="text-sm text-amber-600 mb-2">
      Schema could not be rendered as a form. Showing raw JSON.
    </p>
    <pre className="text-xs font-mono bg-muted/30 rounded p-3 max-h-80 overflow-auto">
      {JSON.stringify(schema, null, 2)}
    </pre>
  </div>
)}
```

### Anti-Patterns to Avoid
- **Don't create new API/tool files:** `CMS_BLOCK_LIST`, `CMS_BLOCK_GET`, `CMS_BLOCK_SCAN` already exist in `server/tools/`. The client-side `block-api.ts` already has `listBlocks()` and `getBlock()`. No new API layer needed.
- **Don't use useEffect for data sync:** The codebase bans `useEffect`. Follow the existing ref-based sync pattern from `block-detail.tsx` (line 71-74): check with a ref and setState inline during render.
- **Don't add memoization:** React 19 compiler handles optimization. `useMemo`/`useCallback`/`memo` are banned.
- **Don't build a general-purpose JSON viewer:** The schema tree only needs to handle JSON Schema structure (properties, type, required, items, etc.), not arbitrary JSON.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible sections | Custom expand/collapse with state arrays | `@deco/ui` Collapsible (Radix) | Accessible, animated, handles keyboard interaction |
| Form from JSON Schema | Custom form renderer | `PropEditor` (existing RJSF wrapper) | Already handles all JSON Schema types with custom CMS templates |
| JSON Schema validation | Manual schema validation | `@rjsf/validator-ajv8` | Already integrated, handles $ref resolution and complex schemas |
| Query state management | Manual loading/error tracking | React Query `useQuery`/`useMutation` | Already used throughout; handles caching, invalidation, optimistic updates |
| Table styling | Custom table markup | `@deco/ui` Table components | Consistent with rest of Mesh UI, handles sticky headers and responsive layout |

**Key insight:** This phase is 90% UI refactoring of existing components. The data layer, tools, and routing are all already implemented.

## Common Pitfalls

### Pitfall 1: Calling CMS_BLOCK_SCAN Through Wrong Channel
**What goes wrong:** Trying to call `CMS_BLOCK_SCAN` through the `toolCaller` from `usePluginContext`. The `toolCaller` is wired to the site connection's MCP (filesystem tools). `CMS_BLOCK_SCAN` is a server plugin tool that needs to be called through the self MCP client.
**Why it happens:** Other operations (list blocks, get block) go through `toolCaller` because they use SITE_BINDING tools (LIST_FILES, READ_FILE). The scan tool is different -- it's a server-side tool registered in `server/tools/index.ts`.
**How to avoid:** Use `useMCPClient({ connectionId: SELF_MCP_ALIAS_ID, orgId: org.id })` to get the self client, then call `selfClient.callTool({ name: "CMS_BLOCK_SCAN", arguments: { connectionId } })`.
**Warning signs:** "Tool not found" errors when trying to scan, or the scan returning empty results because it can't create its own MCP proxy.

### Pitfall 2: Schema Tree Infinite Recursion
**What goes wrong:** JSON Schema can have circular references via `$ref` and `$defs`. A naive recursive tree will stack overflow.
**Why it happens:** Schemas generated by ts-json-schema-generator commonly use `$defs` for shared types and `$ref` pointers.
**How to avoid:** (1) Set a maximum depth limit (e.g., 5 levels), (2) Track visited `$ref` paths to detect cycles, (3) Render a "see definition" link for already-expanded refs instead of recursing.
**Warning signs:** Browser tab freezing when viewing a block with recursive types (e.g., tree data structures).

### Pitfall 3: Query Cache Staleness After Re-Scan
**What goes wrong:** After `CMS_BLOCK_SCAN` completes, the block list still shows old data because the React Query cache wasn't invalidated.
**Why it happens:** The scan mutation runs server-side and writes new files. The client's cached `listBlocks()` result doesn't know about the change.
**How to avoid:** In the mutation's `onSuccess`, call `queryClient.invalidateQueries({ queryKey: blockKeys.all(connectionId) })`. This forces a refetch of the block list.
**Warning signs:** Blocks not updating after scan until manual page refresh.

### Pitfall 4: Empty blocks[] vs No Connection
**What goes wrong:** Showing "Scan Codebase" when the real issue is no connection is configured.
**Why it happens:** Confusing two different empty states.
**How to avoid:** The PluginLayout already gates on connection presence (renders `renderEmptyState()` when no connection). The sections-list component only renders when a connection exists. So within sections-list, empty blocks always means "no blocks scanned" and the scan prompt is correct.
**Warning signs:** Non-issue due to PluginLayout architecture, but good to verify during testing.

### Pitfall 5: Two-Column Layout Responsiveness
**What goes wrong:** The schema tree and prop editor side-by-side break on narrow screens.
**Why it happens:** Fixed two-column layout without responsive breakpoints.
**How to avoid:** Use `grid grid-cols-1 lg:grid-cols-2` so columns stack on smaller screens. The schema tree should be collapsible and default-collapsed on mobile.
**Warning signs:** Content overflow or horizontal scrolling in the detail view.

## Code Examples

Verified patterns from the existing codebase:

### Existing Block List Data Fetching (from sections-list.tsx)
```typescript
// Source: packages/mesh-plugin-site-editor/client/components/sections-list.tsx
const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();

const {
  data: blocks = [],
  isLoading,
  error,
} = useQuery({
  queryKey: blockKeys.all(connectionId),
  queryFn: () => listBlocks(toolCaller),
});
```

### Existing Block Detail Fetching (from block-detail.tsx)
```typescript
// Source: packages/mesh-plugin-site-editor/client/components/block-detail.tsx
const { blockId } = siteEditorRouter.useParams({
  from: "/site-editor-layout/sections/$blockId",
});

const { data: block, isLoading, error } = useQuery({
  queryKey: blockKeys.detail(connectionId, blockId),
  queryFn: () => getBlock(toolCaller, blockId),
});
```

### Calling Server Plugin Tools via Self MCP (from pages-list.tsx)
```typescript
// Source: packages/mesh-plugin-site-editor/client/components/pages-list.tsx
import { SELF_MCP_ALIAS_ID, useMCPClient, useProjectContext } from "@decocms/mesh-sdk";

const { org } = useProjectContext();
const selfClient = useMCPClient({
  connectionId: SELF_MCP_ALIAS_ID,
  orgId: org.id,
});

// Then call server tools:
await selfClient.callTool({
  name: "CMS_BLOCK_SCAN",
  arguments: { connectionId },
});
```

### useMutation Pattern for Scan (from pages-list.tsx create pattern)
```typescript
// Source: adapted from pages-list.tsx createMutation pattern
const scanMutation = useMutation({
  mutationFn: () =>
    selfClient.callTool({
      name: "CMS_BLOCK_SCAN",
      arguments: { connectionId },
    }),
  onSuccess: () => {
    toast.success("Codebase scan complete");
    queryClient.invalidateQueries({
      queryKey: blockKeys.all(connectionId),
    });
  },
  onError: (err) => {
    toast.error(`Scan failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  },
});
```

### Table Row Navigation (from pages-list.tsx)
```typescript
// Source: packages/mesh-plugin-site-editor/client/components/pages-list.tsx
navigate({
  to: "/site-editor-layout/sections/$blockId",
  params: { blockId: block.id },
})
```

### Collapsible Component Usage
```typescript
// Source: packages/ui/src/components/collapsible.tsx
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
```

### Block Definition Shape (from block-api.ts)
```typescript
// Source: packages/mesh-plugin-site-editor/client/lib/block-api.ts
export interface BlockDefinition {
  id: string;           // e.g., "sections--Hero"
  component: string;    // e.g., "sections/Hero.tsx"
  label: string;        // e.g., "Hero Banner"
  category: string;     // e.g., "Sections"
  description: string;
  schema: Record<string, unknown>;  // JSON Schema
  defaults: Record<string, unknown>;
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    propsTypeName: string | null;
    customized: string[];
  };
}
```

### CMS_BLOCK_SCAN Output Shape (from server/tools/block-scan.ts)
```typescript
// Source: packages/mesh-plugin-site-editor/server/tools/block-scan.ts
outputSchema: z.object({
  blocks: z.array(z.object({
    id: z.string(),
    component: z.string(),
    label: z.string(),
    category: z.string(),
    propsCount: z.number(),
  })),
  errors: z.array(z.string()),
}),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Placeholder console.log on scan button | Wire to CMS_BLOCK_SCAN via selfClient | This phase | Scan actually works |
| Single-column scrollable detail | Two-column schema tree + prop editor | This phase | Matches user decision |
| Static category headers | Collapsible category groups | This phase | Dense, scannable layout |

**Existing implementations that need refactoring (not replacement):**
- `sections-list.tsx`: Currently uses card-style buttons with Box icons. Needs table-rows layout with collapsible categories.
- `block-detail.tsx`: Currently single-column with collapsible raw JSON. Needs two-column with schema tree.

## Open Questions

1. **Schema tree $ref resolution**
   - What we know: ts-json-schema-generator outputs `$defs` and `$ref` in generated schemas. The RJSF validator handles ref resolution internally for the form.
   - What's unclear: Whether the schema tree component needs its own `$ref` resolver or can inline-resolve during rendering.
   - Recommendation: Implement simple inline resolution (look up `$ref` in `$defs` and render the referenced schema). Add a depth limit of 5 to prevent infinite recursion. If `$ref` points to an already-expanded path, show a "[circular reference]" label.

2. **Scan progress indication**
   - What we know: `CMS_BLOCK_SCAN` is synchronous (returns when done). Scanning a large codebase could take 10-30 seconds.
   - What's unclear: Whether the MCP tool call provides streaming progress or just a final result.
   - Recommendation: Use the mutation's `isPending` state to show a spinner with "Scanning..." text. No progress bar needed -- just an indeterminate loading state. The toast on success shows the count of discovered blocks.

3. **Re-scan button placement**
   - What we know: User decided scan prompt for empty state but left re-scan trigger to Claude's discretion.
   - What's unclear: Best UX for triggering re-scan when blocks already exist.
   - Recommendation: Place a "Re-scan" button in the header bar (next to the block count badge). Show it only when blocks already exist. Use a RefreshCw icon with "Re-scan" label. During scan, replace with a spinner.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/mesh-plugin-site-editor/server/tools/block-scan.ts` -- full scan tool implementation
- Codebase inspection: `packages/mesh-plugin-site-editor/server/tools/block-list.ts` -- block listing tool
- Codebase inspection: `packages/mesh-plugin-site-editor/server/tools/block-get.ts` -- block detail tool
- Codebase inspection: `packages/mesh-plugin-site-editor/client/lib/block-api.ts` -- client-side block helpers
- Codebase inspection: `packages/mesh-plugin-site-editor/client/components/sections-list.tsx` -- current implementation
- Codebase inspection: `packages/mesh-plugin-site-editor/client/components/block-detail.tsx` -- current implementation
- Codebase inspection: `packages/mesh-plugin-site-editor/client/components/prop-editor.tsx` -- RJSF form wrapper
- Codebase inspection: `packages/mesh-plugin-site-editor/client/lib/router.ts` -- routing already set up
- Codebase inspection: `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` -- query keys defined
- Codebase inspection: `packages/ui/src/components/collapsible.tsx` -- Radix Collapsible wrapper
- Codebase inspection: `packages/ui/src/components/table.tsx` -- Table components
- Codebase inspection: `apps/mesh/src/web/layouts/plugin-layout.tsx` -- connection gating pattern
- Codebase inspection: `packages/mesh-plugin-site-editor/client/components/pages-list.tsx` -- selfClient + useMutation pattern
- Codebase inspection: `packages/mesh-plugin-site-editor/server/scanner/types.ts` -- BlockDefinition type

### Secondary (MEDIUM confidence)
- Codebase inspection: `packages/mesh-plugin-site-editor/client/components/loader-detail.tsx` -- analogous detail view pattern for reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in the codebase
- Architecture: HIGH -- all patterns are direct extensions of existing code; routes, tools, API helpers all exist
- Pitfalls: HIGH -- identified from actual codebase inspection (tool channel confusion is the main risk)

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- internal codebase patterns unlikely to change)

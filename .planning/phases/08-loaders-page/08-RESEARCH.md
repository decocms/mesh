# Phase 8: Loaders Page - Research

**Researched:** 2026-02-16
**Domain:** Client-side UI upgrade -- React components, React Query, TanStack Router
**Confidence:** HIGH

## Summary

Phase 8 is a client-side UI upgrade to the existing loaders list and detail views in the site editor plugin. The current implementation (`loaders-list.tsx` and `loader-detail.tsx`) already works but uses a simpler card-style layout that doesn't match Phase 7's table-rows-with-collapsible-categories pattern. The upgrade involves rewriting both components to mirror the sections page (`sections-list.tsx` and `block-detail.tsx`) patterns exactly, plus adding a scan trigger, connected sections column, and two-column detail layout.

All API infrastructure exists: `loader-api.ts` provides `listLoaders()` and `getLoader()`, React Query keys exist in `query-keys.ts`, routes exist in `router.ts`, and the `SchemaTree` and `PropEditor` components are ready. The `CMS_LOADER_SCAN` server tool is registered and available. The main work is restructuring UI components.

**Primary recommendation:** Rewrite `loaders-list.tsx` and `loader-detail.tsx` to match the exact patterns from `sections-list.tsx` and `block-detail.tsx`, adding connected sections computation and the scan trigger via `CMS_LOADER_SCAN` through selfClient.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### List layout & columns
- Table-row layout with collapsible categories, matching Phase 7 sections pattern exactly
- Four columns: Name, Source, Sections, Params
- "Sections" column shows first 2 connected section names inline + "+N more" truncation
- When a loader has zero connected sections, show muted gray text "No sections"
- Avoid the word "bindings" -- use "Sections" as column header for the loader-to-section relationship

#### Detail view structure
- Two-column layout matching block detail pattern from Phase 7
- Left column: output schema tree (what the loader returns) using existing SchemaTree component as-is
- Right column: input parameters editor (PropEditor form, display only -- no execution)
- Connected sections shown as badge count in the metadata bar area (expandable on click), not a dedicated section
- Breadcrumb: Loaders / {LoaderName}, same pattern as Sections / {BlockName}

#### Scan trigger & states
- Re-scan button calls the same CMS_BLOCK_SCAN tool (one scan for both blocks and loaders)
- Called via selfClient (SELF_MCP_ALIAS_ID), same pattern as sections page
- Button shows spinner during scan, success toast when complete
- Auto-refresh after scan: invalidate React Query cache so list updates automatically
- Empty state matches sections: icon + "No loaders found" + "Scan Codebase" button

#### Consistency with Sections
- Mirror Phase 7 patterns exactly: table-rows, collapsible categories, two-column detail, schema tree
- Same selfClient tool call pattern for scan
- Same breadcrumb navigation pattern
- Key difference from blocks: loaders have both input schema (parameters) and output schema (returned data), split across the two columns (output left, input right)

### Claude's Discretion
- Exact metadata badges and info bar content for loader detail
- How to compute connected sections (cross-reference page configs with loader references)
- Loading skeleton and error state details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already in Codebase)
| Library | Purpose | Already Used In |
|---------|---------|-----------------|
| React 19 | UI components | All plugin components |
| @tanstack/react-query | Data fetching, caching, mutations | sections-list.tsx, block-detail.tsx |
| @tanstack/react-router | Typed routing, navigation | router.ts |
| @deco/ui | shadcn-based design system (Table, Badge, Collapsible, etc.) | sections-list.tsx |
| @rjsf/core + @rjsf/validator-ajv8 | JSON Schema form rendering | prop-editor.tsx |
| sonner | Toast notifications | sections-list.tsx |
| lucide-react + @untitledui/icons | Icons | sections-list.tsx |

### No New Dependencies Required
This phase uses exclusively existing libraries. No installation needed.

## Architecture Patterns

### Pattern 1: Table-Rows with Collapsible Categories (from sections-list.tsx)

**What:** Groups items by category with collapsible sections, each containing a `<Table>` with header and rows.
**Where to copy from:** `/packages/mesh-plugin-site-editor/client/components/sections-list.tsx`

Key implementation details:
- `groupByCategory()` function groups items into `Record<string, T[]>`
- `useState<Set<string>>` tracks open categories (all open by default)
- `toggleCategory()` uses `Set` add/delete to toggle
- Each category renders `Collapsible > CollapsibleTrigger + CollapsibleContent > Table`
- Table columns: `TableHeader > TableRow > TableHead` + `TableBody > TableRow > TableCell`
- Row click navigates via `siteEditorRouter.useNavigate()`

```typescript
// Collapsible category pattern (from sections-list.tsx lines 199-258)
<Collapsible key={category} open={isOpen} onOpenChange={() => toggleCategory(category)}>
  <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border hover:bg-muted/50 transition-colors">
    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    {category}
    <Badge variant="secondary" className="text-xs ml-auto">{count}</Badge>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <Table>...</Table>
  </CollapsibleContent>
</Collapsible>
```

### Pattern 2: Two-Column Detail Layout (from block-detail.tsx)

**What:** Info bar spanning full width, then a `grid grid-cols-1 lg:grid-cols-2` with divide-x for left/right columns.
**Where to copy from:** `/packages/mesh-plugin-site-editor/client/components/block-detail.tsx`

Key structure:
```
[Breadcrumb header]
[Info bar: title + source + description + metadata badges]
[Two columns: left=SchemaTree | right=PropEditor]
```

```typescript
// Two-column layout pattern (from block-detail.tsx lines 169-212)
<div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100%-7rem)] divide-x divide-border">
  <div className="overflow-y-auto p-4">
    <h3 className="text-sm font-medium mb-3">Output Schema</h3>
    <SchemaTree schema={loader.outputSchema} />
  </div>
  <div className="overflow-y-auto p-4">
    <h3 className="text-sm font-medium mb-3">Input Parameters</h3>
    <PropEditor schema={loader.inputSchema} formData={formData} onChange={setFormData} readonly />
  </div>
</div>
```

### Pattern 3: Scan Mutation via selfClient (from sections-list.tsx)

**What:** Uses `useMCPClient` with `SELF_MCP_ALIAS_ID` to call server plugin tools, wrapped in `useMutation` with cache invalidation.
**Where to copy from:** `/packages/mesh-plugin-site-editor/client/components/sections-list.tsx`

**IMPORTANT CORRECTION:** The context says "Re-scan button calls the same CMS_BLOCK_SCAN tool" but the codebase has a **separate** `CMS_LOADER_SCAN` tool (registered in `server/tools/index.ts`, implemented in `server/tools/loader-scan.ts`). The loaders page should call `CMS_LOADER_SCAN`, NOT `CMS_BLOCK_SCAN`. Each tool scans different directories (`sections/`, `components/` vs `loaders/`) and generates different output schemas.

```typescript
// Scan mutation pattern (from sections-list.tsx lines 68-99)
const selfClient = useMCPClient({
  connectionId: SELF_MCP_ALIAS_ID,
  orgId: org.id,
});

const scanMutation = useMutation({
  mutationFn: () =>
    selfClient.callTool({
      name: "CMS_LOADER_SCAN",  // Use CMS_LOADER_SCAN for loaders
      arguments: { connectionId },
    }),
  onSuccess: () => {
    toast.success("Loader scan complete");
    queryClient.invalidateQueries({
      queryKey: loaderKeys.all(connectionId),
    });
  },
  onError: (err: unknown) => {
    toast.error(`Scan failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  },
});
```

### Pattern 4: Ref-Based Data Sync (from block-detail.tsx)

**What:** Syncs initial form data from query result without using useEffect (banned by lint rule).
**Where to copy from:** `/packages/mesh-plugin-site-editor/client/components/block-detail.tsx`

```typescript
const [formData, setFormData] = useState<Record<string, unknown>>({});
const lastSyncedLoaderId = useRef<string | null>(null);

// Sync formData when loader data loads (ref-based, not useEffect)
if (loader && lastSyncedLoaderId.current !== loader.id) {
  lastSyncedLoaderId.current = loader.id;
  setFormData(loader.defaults ?? {});
}
```

### Pattern 5: Connected Sections Computation

**What:** Cross-reference page configs to find which sections (block instances) consume a given loader.
**Approach:** Read all pages, scan all block instance props for `LoaderRef` objects where `__loaderRef` matches the loader ID.

The `LoaderRef` type (from `page-api.ts`) is:
```typescript
interface LoaderRef {
  __loaderRef: string;  // LoaderDefinition.id
  field?: string;
  params?: Record<string, unknown>;
}
```

The `isLoaderRef()` helper already exists in `page-api.ts`:
```typescript
function isLoaderRef(value: unknown): value is LoaderRef {
  return value !== null && typeof value === "object" && "__loaderRef" in (value as Record<string, unknown>);
}
```

**Connected sections computation strategy:**

For the **list view**, enrich `LoaderSummary` with connected section names. This requires:
1. Load all pages via `listPages()` + `getPage()` for each
2. For each page, iterate `page.blocks` and scan all prop values for `isLoaderRef()` matches
3. When `ref.__loaderRef === loader.id`, record the block's `blockType` as a connected section
4. Return unique section names per loader

**Performance consideration:** This requires reading ALL pages to compute connections. For the list view, this could be expensive. Options:
- **Option A (Recommended):** Create a helper function `getConnectedSections(toolCaller, loaderId)` that loads pages and scans for loader refs. Call it per-loader in the list view. Cache result with React Query.
- **Option B:** Create a single `computeLoaderSectionMap(toolCaller)` that does one pass and returns `Map<loaderId, string[]>`. More efficient but requires all pages in memory.
- **Option C:** Only show connected sections in the detail view, not the list. Simplest but doesn't match the decision.

**Recommendation:** Use Option B -- compute a full map once, cache it as a React Query entry. The list view needs all loader connections anyway, so one pass is more efficient than N passes.

```typescript
// Proposed helper in loader-api.ts
async function computeLoaderSectionMap(
  toolCaller: ToolCaller,
): Promise<Map<string, string[]>> {
  const pages = await listPages(toolCaller);
  const map = new Map<string, string[]>();

  for (const pageSummary of pages) {
    const page = await getPage(toolCaller, pageSummary.id);
    if (!page) continue;

    for (const block of page.blocks) {
      for (const [, value] of Object.entries(block.props)) {
        if (isLoaderRef(value)) {
          const loaderId = value.__loaderRef;
          const existing = map.get(loaderId) ?? [];
          // Use block label (derived from blockType) as section name
          const sectionName = block.blockType.replace("sections--", "").replace(/--/g, "/");
          if (!existing.includes(sectionName)) {
            existing.push(sectionName);
          }
          map.set(loaderId, existing);
        }
      }
    }
  }

  return map;
}
```

### Anti-Patterns to Avoid
- **useEffect for data sync:** Banned by `plugins/ban-use-effect.ts`. Use ref-based sync pattern.
- **useMemo/useCallback/memo:** Banned by `plugins/ban-memoization.ts`. React 19 compiler handles optimization.
- **Direct env access in tools:** Always use MeshContext.
- **Relative imports across packages:** Use package paths like `@decocms/bindings/site`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema form | Custom form renderer | `PropEditor` (wraps @rjsf/core) | Already handles all schema types |
| Schema visualization | Custom tree renderer | `SchemaTree` component | Handles $ref resolution, circular refs, depth limits |
| Table UI | Custom table | `@deco/ui Table/TableHeader/TableBody/etc.` | Design system consistency |
| Collapsible sections | Custom accordion | `@deco/ui Collapsible` | Accessibility, animation |
| Toast notifications | Custom notification | `sonner` toast | Already configured |
| Query caching | Manual state management | React Query useQuery/useMutation | Already set up with query keys |

**Key insight:** Every UI primitive and data-fetching pattern already exists in the codebase from Phase 7. This phase is fundamentally a copy-and-adapt exercise.

## Common Pitfalls

### Pitfall 1: Using CMS_BLOCK_SCAN Instead of CMS_LOADER_SCAN
**What goes wrong:** The context decision says "Re-scan button calls the same CMS_BLOCK_SCAN tool" but the codebase has separate scan tools. Using CMS_BLOCK_SCAN would scan for React components, not loaders.
**Why it happens:** The context decision may have been a simplification or mistake.
**How to avoid:** Use `CMS_LOADER_SCAN` for the loaders page. It scans `loaders/` directory and generates `inputSchema` + `outputSchema`. Also invalidate `loaderKeys.all()` (not `blockKeys.all()`).
**Warning signs:** If the scan returns `blocks` instead of `loaders` in the response.

### Pitfall 2: Expensive Connected Sections Computation
**What goes wrong:** Reading all pages on every list render to compute which sections use each loader.
**Why it happens:** The connection data is embedded in page block instance props, not in loader definitions.
**How to avoid:** Use a dedicated React Query key for the section map (e.g., `loaderKeys.sectionMap(connectionId)`), compute once, and cache. Invalidate when pages change.
**Warning signs:** Slow list loading, excessive file reads.

### Pitfall 3: Using useEffect for Form Data Sync
**What goes wrong:** Lint rule `ban-use-effect.ts` rejects the code.
**Why it happens:** Common React pattern, but banned in this codebase.
**How to avoid:** Use the ref-based sync pattern from `block-detail.tsx`.
**Warning signs:** Lint failures.

### Pitfall 4: Forgetting to Also Invalidate Loader Keys After Scan
**What goes wrong:** Scan completes but list doesn't update.
**Why it happens:** Missing `queryClient.invalidateQueries()` call.
**How to avoid:** Mirror the sections-list.tsx pattern exactly, using `loaderKeys.all(connectionId)`.

### Pitfall 5: Incorrect Height Calculation in Two-Column Layout
**What goes wrong:** Content overflows or columns don't scroll independently.
**Why it happens:** The `h-[calc(100%-7rem)]` value in block-detail.tsx is tuned for that specific info bar height.
**How to avoid:** Match the exact info bar height, or adjust the calc value if the loader info bar is taller (it may need adjustment if connected sections badge adds height).

## Code Examples

### Existing Files to Modify

1. **`/packages/mesh-plugin-site-editor/client/components/loaders-list.tsx`** -- Full rewrite to match sections-list.tsx pattern
2. **`/packages/mesh-plugin-site-editor/client/components/loader-detail.tsx`** -- Full rewrite to match block-detail.tsx pattern

### Existing Files to Extend

3. **`/packages/mesh-plugin-site-editor/client/lib/loader-api.ts`** -- Add `computeLoaderSectionMap()` helper
4. **`/packages/mesh-plugin-site-editor/client/lib/query-keys.ts`** -- Add `sectionMap` key under `loaders`

### Files That Need No Changes
- `router.ts` -- Routes already exist for `/loaders` and `/loaders/$loaderId`
- `schema-tree.tsx` -- Used as-is
- `prop-editor.tsx` -- Used as-is (with `readonly` prop for display-only mode)
- `block-api.ts` -- Not touched
- `sections-list.tsx` -- Not touched, only used as reference

### Loader List Component Structure (Target)

```typescript
// loaders-list.tsx target structure
import { useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { SELF_MCP_ALIAS_ID, useMCPClient, useProjectContext } from "@decocms/mesh-sdk";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@deco/ui/components/table.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@deco/ui/components/collapsible.tsx";
// ... other imports

export default function LoadersList() {
  // 1. Plugin context + selfClient (same as sections-list)
  // 2. useQuery for loaders list
  // 3. useQuery for connected sections map
  // 4. useMutation for CMS_LOADER_SCAN via selfClient
  // 5. groupByCategory + openCategories state
  // 6. Render: header with badge + re-scan button
  // 7. Render: collapsible categories with Table rows
  //    - Columns: Name, Source, Sections (connected), Params
  //    - Row click navigates to /loaders/$loaderId
  // 8. Empty state with "Scan Codebase" button
}
```

### Loader Detail Component Structure (Target)

```typescript
// loader-detail.tsx target structure
export default function LoaderDetail() {
  // 1. Plugin context + router params
  // 2. useQuery for loader detail
  // 3. useQuery for connected sections (for this loader)
  // 4. Ref-based formData sync
  // 5. Breadcrumb: Loaders / {loader.label}
  // 6. Info bar: title, source, description, metadata badges
  //    - Connected sections badge count (expandable on click)
  // 7. Two-column grid:
  //    - Left: SchemaTree for outputSchema
  //    - Right: PropEditor for inputSchema (readonly/display only)
}
```

### Connected Sections Badge (Detail View)

For the detail view, show connected sections as an expandable badge in the metadata bar:

```typescript
// Expandable connected sections in metadata bar
const [sectionsExpanded, setSectionsExpanded] = useState(false);

// In metadata bar:
<button
  type="button"
  onClick={() => setSectionsExpanded(!sectionsExpanded)}
  className="inline-flex items-center gap-1"
>
  <Badge variant="secondary" className="text-xs">
    {connectedSections.length} sections
  </Badge>
  {connectedSections.length > 0 && (
    sectionsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
  )}
</button>

// Expanded list (conditionally rendered below metadata):
{sectionsExpanded && connectedSections.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mt-2">
    {connectedSections.map((name) => (
      <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
    ))}
  </div>
)}
```

### Sections Column in List View

```typescript
// "Sections" column showing first 2 names + "+N more" truncation
<TableCell className="text-sm">
  {connectedSections.length === 0 ? (
    <span className="text-muted-foreground">No sections</span>
  ) : (
    <span>
      {connectedSections.slice(0, 2).join(", ")}
      {connectedSections.length > 2 && (
        <span className="text-muted-foreground ml-1">
          +{connectedSections.length - 2} more
        </span>
      )}
    </span>
  )}
</TableCell>
```

## Data Model Summary

### LoaderSummary (list view)
```typescript
interface LoaderSummary {
  id: string;           // e.g., "loaders--productList"
  source: string;       // e.g., "loaders/productList.ts"
  label: string;        // e.g., "Product List"
  category: string;     // e.g., "Loaders"
  inputParamsCount: number;
}
```

### LoaderDefinition (detail view)
```typescript
interface LoaderDefinition {
  id: string;
  source: string;
  label: string;
  category: string;
  description: string;
  inputSchema: Record<string, unknown>;   // JSON Schema for params (right column)
  outputSchema: Record<string, unknown>;  // JSON Schema for return data (left column)
  defaults: Record<string, unknown>;
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    propsTypeName: string | null;
    returnTypeName: string | null;
    customized: string[];
  };
}
```

### LoaderRef (in page block props)
```typescript
interface LoaderRef {
  __loaderRef: string;  // LoaderDefinition.id
  field?: string;
  params?: Record<string, unknown>;
}
```

## State of the Art

| Current State | Target State | Change Required |
|--------------|-------------|----------------|
| `loaders-list.tsx`: card-style list with no scan trigger | Table-rows with collapsible categories + scan mutation | Full rewrite |
| `loader-detail.tsx`: single-column with collapsible raw JSON | Two-column layout with SchemaTree + PropEditor | Full rewrite |
| No connected sections computation | Cross-reference pages to find loader consumers | New helper in loader-api.ts |
| Placeholder `console.log` for scan | Real `CMS_LOADER_SCAN` via selfClient | Wire up mutation |
| No query key for section map | `loaderKeys.sectionMap(connectionId)` | Add to query-keys.ts |

## Open Questions

1. **Should the scan also invalidate block keys?**
   - What we know: `CMS_LOADER_SCAN` only scans loaders, `CMS_BLOCK_SCAN` only scans blocks. They are separate tools.
   - What's unclear: The context decision says "one scan for both" but the codebase has separate tools.
   - Recommendation: Use `CMS_LOADER_SCAN` for the loaders page. If users want a combined scan, that would be a separate feature. Follow what the codebase actually has.

2. **Performance of connected sections computation**
   - What we know: Requires reading all pages, then scanning all block props for LoaderRef matches.
   - What's unclear: How many pages/blocks a typical site has.
   - Recommendation: Compute once per list render, cache with React Query. If it's slow, the staleTime can be increased. Worst case, add a loading state for the Sections column.

3. **PropEditor readonly mode**
   - What we know: The `PropEditor` component accepts a `readonly` prop.
   - What's unclear: Whether the readonly rendering looks good enough for a "display only" context.
   - Recommendation: Use `readonly={true}` as-is. If it needs styling adjustments, that's a minor follow-up.

## Sources

### Primary (HIGH confidence)
- Codebase files read directly:
  - `packages/mesh-plugin-site-editor/client/components/sections-list.tsx` -- sections list pattern
  - `packages/mesh-plugin-site-editor/client/components/block-detail.tsx` -- block detail pattern
  - `packages/mesh-plugin-site-editor/client/components/loaders-list.tsx` -- current loader list (to rewrite)
  - `packages/mesh-plugin-site-editor/client/components/loader-detail.tsx` -- current loader detail (to rewrite)
  - `packages/mesh-plugin-site-editor/client/lib/loader-api.ts` -- loader data types and API
  - `packages/mesh-plugin-site-editor/client/lib/page-api.ts` -- LoaderRef type, isLoaderRef helper
  - `packages/mesh-plugin-site-editor/client/lib/query-keys.ts` -- React Query key structure
  - `packages/mesh-plugin-site-editor/client/lib/router.ts` -- existing routes
  - `packages/mesh-plugin-site-editor/client/components/schema-tree.tsx` -- reusable SchemaTree
  - `packages/mesh-plugin-site-editor/client/components/prop-editor.tsx` -- reusable PropEditor
  - `packages/mesh-plugin-site-editor/server/tools/loader-scan.ts` -- CMS_LOADER_SCAN tool
  - `packages/mesh-plugin-site-editor/server/tools/block-scan.ts` -- CMS_BLOCK_SCAN tool (for comparison)
  - `packages/mesh-plugin-site-editor/server/tools/index.ts` -- tool registration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already in use, no new dependencies
- Architecture: HIGH -- Exact patterns exist in sections-list.tsx and block-detail.tsx to copy from
- Pitfalls: HIGH -- Identified from direct codebase inspection (scan tool mismatch, useEffect ban, connected sections performance)
- Connected sections computation: MEDIUM -- Logic is straightforward but untested, performance unknown

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- all patterns already exist in codebase)

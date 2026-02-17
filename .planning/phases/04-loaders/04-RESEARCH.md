# Phase 4: Loaders - Research

**Researched:** 2026-02-14
**Domain:** CMS loader editor UI, data source configuration, prop mapping
**Confidence:** HIGH

## Summary

Phase 4 introduces loaders as first-class entities in the site editor plugin. The existing codebase already has the complete infrastructure patterns needed: SITE_BINDING file operations, block definitions in `.deco/blocks/`, the `@rjsf/core` prop editor, React Query for data fetching, and a router with a `/loaders` stub route. The primary work is creating a new "loader definition" data format stored in `.deco/loaders/`, building CRUD tools mirroring the existing block tools, implementing the loader list/detail UI mirroring the sections pattern, and adding a prop-mapping mechanism that connects loader output to section props on block instances.

In the deco runtime, loaders are TypeScript functions that take typed props and return typed output. A section's `loader` field maps loader output to section props via a `PropsLoader` type that supports three modes: a single function, an object-per-prop mapping, or a direct value. The CMS equivalent needs a visual way to: (1) browse/create loader instances, (2) configure their input parameters, and (3) bind their output to section prop fields. The decofile JSON format uses `__resolveType` references for this binding (e.g., a section prop points to a loader instance by name).

**Primary recommendation:** Follow the exact patterns established by blocks/sections (`.deco/loaders/` directory, `LoaderDefinition` type, server tools, client API, list/detail components, query keys) and add a "loader binding" concept to `BlockInstance.props` where individual prop values can reference a loader instance instead of a static value.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @rjsf/core | ^6.1.2 | JSON Schema form rendering for loader params | Already used for section props; same pattern |
| @tanstack/react-query | >=5.0.0 | Data fetching / caching | Already the standard in all plugin components |
| zod | ^4.0.0 | Server tool input/output schemas | Already used in all server tools |
| ts-morph | ^27.0.2 | Loader discovery from TypeScript source | Already used for section scanning |
| ts-json-schema-generator | ^2.4.0 | Generate JSON Schema from loader Props types | Already used for section schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | >=5.0.0 | Generate loader instance IDs | When creating new loader instances |
| lucide-react | ^0.468.0 | Icons for loader UI | Consistent with existing icon set |
| @untitledui/icons | ^0.0.19 | Additional icons (Database01 already imported for Loaders sidebar) | Header/status indicators |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| File-based `.deco/loaders/` storage | Database/Supabase storage | File-based is consistent with pages/blocks pattern and works offline |
| ts-morph scanner for loaders | Manual-only registration | Scanner is already built; extending it to .ts files (not just .tsx) gives auto-discovery |
| Inline prop-to-loader mapping in BlockInstance | Separate mapping table | Inline is simpler, consistent with deco's `__resolveType` pattern |

**Installation:** No new dependencies required. All libraries are already in the dependency tree.

## Architecture Patterns

### Recommended Project Structure
```
mesh-plugin-site-editor/
├── server/
│   ├── tools/
│   │   ├── loader-list.ts      # CMS_LOADER_LIST
│   │   ├── loader-get.ts       # CMS_LOADER_GET
│   │   ├── loader-create.ts    # CMS_LOADER_CREATE
│   │   ├── loader-update.ts    # CMS_LOADER_UPDATE
│   │   ├── loader-delete.ts    # CMS_LOADER_DELETE
│   │   ├── loader-scan.ts      # CMS_LOADER_SCAN (discover loaders from source)
│   │   └── index.ts            # Add new tools to exports
│   └── scanner/
│       └── discover.ts         # Extend to discover .ts loader files (not just .tsx)
├── client/
│   ├── components/
│   │   ├── loaders-list.tsx    # Replace stub with full implementation
│   │   ├── loader-detail.tsx   # Loader config editor (params + output mapping)
│   │   └── loader-picker.tsx   # Modal for binding a loader to a section prop
│   └── lib/
│       ├── loader-api.ts       # Client-side loader CRUD helpers
│       ├── query-keys.ts       # Add loader query keys
│       └── router.ts           # Add /loaders/$loaderId route
```

### Pattern 1: Loader Definition (stored in `.deco/loaders/`)
**What:** A loader definition describes a data-fetching function with typed input params and typed output schema, analogous to BlockDefinition for sections.
**When to use:** Every loader discovered by scanner or manually registered.
**Example:**
```typescript
// Source: derived from existing BlockDefinition in server/scanner/types.ts
interface LoaderDefinition {
  /** Unique ID, e.g., "loaders--productList" */
  id: string;
  /** Source file path, e.g., "loaders/productList.ts" */
  source: string;
  /** Human-readable label, e.g., "Product List" */
  label: string;
  /** Category derived from directory */
  category: string;
  /** Description from JSDoc */
  description: string;
  /** JSON Schema for the loader's INPUT parameters (Props type) */
  inputSchema: JSONSchema7;
  /** JSON Schema for the loader's OUTPUT (return type) */
  outputSchema: JSONSchema7;
  /** Default input parameter values */
  defaults: Record<string, unknown>;
  /** Scan metadata (same shape as BlockDefinition.metadata) */
  metadata: {
    scannedAt: string;
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    propsTypeName: string | null;
    returnTypeName: string | null;
    customized: string[];
  };
}
```

### Pattern 2: Loader Instance (stored in `.deco/loader-instances/`)
**What:** A configured instance of a loader with specific parameter values, analogous to how deco's decofile stores resolved loader configs. A loader instance is a named, reusable configuration that can be referenced from section props.
**When to use:** When user creates "Product List for Homepage" from the "Product List" loader definition.
**Example:**
```typescript
interface LoaderInstance {
  /** Unique instance ID, e.g., "loader_aB3x9kQ2" */
  id: string;
  /** Reference to LoaderDefinition.id */
  loaderType: string;
  /** Human-readable name, e.g., "Homepage Products" */
  name: string;
  /** Configured parameter values */
  params: Record<string, unknown>;
  /** Metadata */
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
}
```

### Pattern 3: Loader Binding in BlockInstance Props
**What:** A section's prop can be a static value OR a reference to a loader instance. This follows deco's `__resolveType` pattern but simplified for the CMS.
**When to use:** When user maps a loader's output to a section's prop field.
**Example:**
```typescript
// Current BlockInstance (from page-api.ts):
interface BlockInstance {
  id: string;
  blockType: string;
  props: Record<string, unknown>;
}

// A prop value that references a loader:
// Instead of: { products: [...static data...] }
// Use:        { products: { __loaderRef: "loader_aB3x9kQ2", field: "items" } }

interface LoaderRef {
  __loaderRef: string;  // LoaderInstance.id
  field?: string;       // Optional: pick a specific field from loader output
}
```

### Pattern 4: Scanner Extension for Loaders
**What:** Extend the existing block scanner to discover loader functions (default-exported functions in `loaders/` directory that return non-JSX values).
**When to use:** The scanner currently only processes `.tsx` files. Loaders are `.ts` files with a different signature (function returning data, not JSX).
**Example:**
```typescript
// A typical loader file (from apps repo):
// loaders/temperature.ts
export interface Props {
  lat?: number;
  long?: number;
}
export default async function weather(props: Props, request: Request): Promise<Temperature | null> {
  // ... fetch data ...
}

// Scanner needs to:
// 1. Include .ts files from loaders/ directory
// 2. Extract Props type -> inputSchema
// 3. Extract return type -> outputSchema (NEW - blocks only need props schema)
// 4. NOT check for JSX return type (loader check = NOT JSX)
```

### Anti-Patterns to Avoid
- **Coupling loader execution to the editor:** Phase 4 is about CONFIGURATION, not runtime execution. The editor stores loader configs; the runtime resolves them. Do not try to actually execute loaders in the editor.
- **Inventing a new storage format:** Follow `.deco/` file convention exactly. JSON files, same LIST_FILES/READ_FILE/PUT_FILE tools.
- **Mixing loader definitions with block definitions:** Keep `.deco/loaders/` separate from `.deco/blocks/`. They are distinct entity types with different schemas (input+output vs just props).
- **Complex nested loader chaining in v1:** A prop either has a static value or references ONE loader instance. No loader-to-loader chains in this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form rendering for loader params | Custom form builder | @rjsf/core PropEditor (already exists) | Complex validation, nested objects, arrays already handled |
| JSON Schema generation | Manual schema construction | ts-json-schema-generator via existing `generateSchema()` | Edge cases (unions, generics, mapped types) handled |
| File CRUD operations | Direct filesystem access | SITE_BINDING tools (READ_FILE, PUT_FILE, LIST_FILES) | Platform-agnostic, works with any MCP backend |
| Query caching/invalidation | Custom cache | @tanstack/react-query (already wired) | Optimistic updates, automatic refetching, devtools |
| Routing | Custom route matching | createPluginRouter (already exists) | Type-safe params, lazy loading, consistent with existing routes |

**Key insight:** The entire infrastructure for CRUD entities in `.deco/` directories already exists. Loaders are structurally identical to blocks (definition + instances + UI), just with different data (input params + output schema instead of component props).

## Common Pitfalls

### Pitfall 1: Trying to Execute Loaders in the Editor
**What goes wrong:** Temptation to show "live" loader data in the editor, which requires runtime context (Request, secrets, DB connections).
**Why it happens:** "First-class" feels like it should mean "working." But the editor is a configuration tool, not a runtime.
**How to avoid:** Phase 4 scope is CONFIGURATION ONLY. The editor creates/edits loader instances and binds them to section props. Mock/sample data can be shown but actual execution is deferred.
**Warning signs:** Any code that calls `fetch()` from the editor to execute a loader.

### Pitfall 2: Output Schema Generation Complexity
**What goes wrong:** Generating outputSchema from TypeScript return types is harder than inputSchema from Props. Return types may be Promise<T | null>, complex unions, or generic types.
**Why it happens:** `ts-json-schema-generator` can handle return types but needs the unwrapped type name (not `Promise<T>`).
**How to avoid:** Unwrap `Promise<>` and `null` before passing to schema generator. For the outputSchema, extract the resolved return type. If generation fails, fall back to `{ type: "object", additionalProperties: true }` (same pattern as current block scanner).
**Warning signs:** Output schemas that say "Promise" in the type.

### Pitfall 3: Breaking Existing BlockInstance Serialization
**What goes wrong:** Adding `__loaderRef` objects inside `BlockInstance.props` could break the existing PropEditor which expects plain values.
**Why it happens:** The prop editor renders the full props object; loader refs are "magic" values.
**How to avoid:** The PropEditor should detect loader-ref props and render a "Loader Binding" widget instead of a regular form field. Use a custom @rjsf widget or field template that checks for `__loaderRef`. Alternatively, keep loader bindings in a separate `loaderBindings` field on `BlockInstance` rather than inline in props.
**Warning signs:** PropEditor showing `[object Object]` for loader-bound props, or losing loader bindings on form submission.

### Pitfall 4: Scanner Not Finding Loaders
**What goes wrong:** The current scanner only processes `.tsx` files and checks for JSX return types.
**Why it happens:** Loaders are `.ts` files returning data, not JSX.
**How to avoid:** Create a separate `discoverLoaders()` function (or extend `discoverComponents` with a mode flag). For loaders: scan `.ts` files in `loaders/` prefix, look for default exports that are async functions, and extract both input Props and return type.
**Warning signs:** Empty loader list after scanning a project that has `loaders/` directory.

### Pitfall 5: Confusing Loader Definitions vs Loader Instances
**What goes wrong:** Treating "Product List loader" (the definition/code) and "Homepage Products" (a configured instance with specific params) as the same thing.
**Why it happens:** Sections/blocks have a similar two-level concept (BlockDefinition vs BlockInstance on a page) but the naming is less explicit.
**How to avoid:** Clear separation: `.deco/loaders/{id}.json` = LoaderDefinition (the "what"), `.deco/loader-instances/{id}.json` = LoaderInstance (a "configured how"). The list view shows definitions; the detail view lets you create/manage instances.
**Warning signs:** Users can't reuse the same loader with different params on different pages.

## Code Examples

Verified patterns from the existing codebase:

### Loader API Helpers (following block-api.ts pattern)
```typescript
// Source: derived from client/lib/block-api.ts
const LOADERS_PREFIX = ".deco/loaders/";

export interface LoaderSummary {
  id: string;
  source: string;
  label: string;
  category: string;
  inputParamsCount: number;
}

export async function listLoaders(toolCaller: ToolCaller): Promise<LoaderSummary[]> {
  const listResult = await toolCaller("LIST_FILES", {
    prefix: LOADERS_PREFIX,
  });

  if (!listResult.files || listResult.files.length === 0) {
    return [];
  }

  const loaders: LoaderSummary[] = [];
  for (const file of listResult.files) {
    if (!file.path.endsWith(".json")) continue;
    try {
      const readResult = await toolCaller("READ_FILE", { path: file.path });
      const loader = JSON.parse(readResult.content);
      if (loader.deleted) continue;
      const inputParamsCount = Object.keys(loader.inputSchema?.properties ?? {}).length;
      loaders.push({
        id: loader.id,
        source: loader.source,
        label: loader.label,
        category: loader.category ?? "Other",
        inputParamsCount,
      });
    } catch {
      continue;
    }
  }
  loaders.sort((a, b) => a.label.localeCompare(b.label));
  return loaders;
}
```

### Server Tool (following block-list.ts pattern)
```typescript
// Source: derived from server/tools/block-list.ts
export const LOADER_LIST: ServerPluginToolDefinition = {
  name: "CMS_LOADER_LIST",
  description: "List all CMS loader definitions.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
  }),
  outputSchema: z.object({
    loaders: z.array(z.object({
      id: z.string(),
      source: z.string(),
      label: z.string(),
      category: z.string(),
      inputParamsCount: z.number(),
    })),
  }),
  handler: async (input, ctx) => {
    const { connectionId } = input as { connectionId: string };
    const proxy = await ctx.createMCPProxy(connectionId);
    try {
      // ... same LIST_FILES + READ_FILE pattern as BLOCK_LIST ...
    } finally {
      await proxy.close?.();
    }
  },
};
```

### Router Extension
```typescript
// Source: derived from client/lib/router.ts
const loaderDetailRoute = createRoute({
  getParentRoute: () => ctx.parentRoute,
  path: "/loaders/$loaderId",
  component: lazyRouteComponent(() => import("../components/loader-detail")),
});
```

### Query Keys Extension
```typescript
// Source: derived from client/lib/query-keys.ts
export const queryKeys = {
  pages: { /* existing */ },
  blocks: { /* existing */ },
  loaders: {
    all: (connectionId: string) =>
      ["site-editor", "loaders", connectionId] as const,
    detail: (connectionId: string, loaderId: string) =>
      ["site-editor", "loaders", connectionId, loaderId] as const,
  },
  loaderInstances: {
    all: (connectionId: string) =>
      ["site-editor", "loader-instances", connectionId] as const,
    detail: (connectionId: string, instanceId: string) =>
      ["site-editor", "loader-instances", connectionId, instanceId] as const,
  },
} as const;
```

### Loader Binding Widget for PropEditor
```typescript
// A custom @rjsf widget that renders "Loader: Homepage Products" instead of a form field
// when a prop has a __loaderRef binding.
// This would be registered in client/components/rjsf/widgets.tsx
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Loaders invisible in CMS | Loaders as first-class editor citizens | This phase (Phase 4) | Users can manage data fetching without code |
| `__resolveType` for loader references | `__loaderRef` in block instance props | New for mesh CMS | Simpler than full deco resolver; editor-only concept |
| Single-level block definitions | Two-level: definition + instance | Existing for sections (BlockDefinition + BlockInstance), new for loaders | Enables reuse across pages |

**Deprecated/outdated:**
- Deco's `singleFlightKey` on loaders is deprecated in favor of `cacheKey` (not directly relevant to editor but good to know for schema generation -- don't surface deprecated exports).

## Open Questions

1. **Should loader instances live in `.deco/loader-instances/` or be embedded in page definitions?**
   - What we know: Deco's decofile stores loader configs as top-level named entries that sections reference by name. Pages store section instances with their props.
   - What's unclear: Whether a separate directory is needed, or whether loader bindings inside `BlockInstance.props` are sufficient for v1.
   - Recommendation: Start with the simpler approach -- `__loaderRef` inline in `BlockInstance.props` referencing a LoaderDefinition directly (with configured params). If reuse across pages is needed, introduce LoaderInstance as a separate entity. **For v1, inline is simpler and sufficient per success criteria.**

2. **How deep should the output-to-prop mapping go?**
   - What we know: Deco supports three modes: single function loader, per-prop object loader, or direct value. The simplest is "loader output replaces this prop."
   - What's unclear: Whether users need to pick sub-fields of loader output (e.g., `loader.data.items` -> section `products` prop).
   - Recommendation: Start with whole-output mapping (loader output -> one prop). Add field picking (`field` path) as an enhancement if needed. The `field` property in `LoaderRef` covers this.

3. **Should the scanner auto-discover loaders, or is manual registration sufficient?**
   - What we know: The scanner infrastructure (ts-morph, schema generation) already exists. Extending to `.ts` files is straightforward.
   - What's unclear: How many projects actually have a `loaders/` directory with scannable loaders.
   - Recommendation: Implement both: scanner for auto-discovery (CMS_LOADER_SCAN) + manual registration (CMS_LOADER_REGISTER). Scanner provides the "magic" experience; manual registration is the fallback.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `/Users/guilherme/Projects/mesh/packages/mesh-plugin-site-editor/` - all patterns verified by reading source
- Existing codebase: `/Users/guilherme/Projects/deco/blocks/loader.ts` - loader runtime concept
- Existing codebase: `/Users/guilherme/Projects/deco/blocks/propsLoader.ts` - prop-to-loader mapping concept
- Existing codebase: `/Users/guilherme/Projects/deco/blocks/section.ts` - section.loader field pattern
- Existing codebase: `/Users/guilherme/Projects/deco/engine/core/README.md` - decofile `__resolveType` pattern
- Existing codebase: `/Users/guilherme/Projects/apps/weather/loaders/temperature.ts` - example loader structure

### Secondary (MEDIUM confidence)
- Deco runtime patterns extrapolated from source code reading (runtime execution semantics not fully traced)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, all infrastructure exists
- Architecture: HIGH - direct extension of existing patterns (blocks -> loaders)
- Pitfalls: HIGH - based on actual codebase analysis, known scanner limitations
- Loader-to-prop binding design: MEDIUM - the `__loaderRef` pattern is a design decision, not verified against runtime behavior

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- all based on existing codebase patterns)

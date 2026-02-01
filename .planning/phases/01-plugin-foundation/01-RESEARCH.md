# Phase 1: Site Builder Plugin Foundation - Research

**Researched:** 2026-02-01
**Domain:** Mesh plugin development, React architecture, TanStack Router
**Confidence:** HIGH

## Summary

This phase requires creating a new Mesh plugin following established patterns from the existing `mesh-plugin-task-runner`. The codebase has a well-defined plugin architecture using React 19, TanStack Router v1, TanStack Query v5, and Radix UI components. Plugins use a well-known binding system to filter connections and register sidebar items.

The research focused on three areas:
1. **Existing plugin patterns** - How task-runner plugin is structured and registered
2. **Connection filtering** - How bindings work to filter compatible connections
3. **Routing architecture** - How TanStack Router is used for plugin navigation

The standard approach is to create a plugin following the task-runner template, define a custom binding for connection filtering (checking for deno.json with deco/ imports), and use the `createPluginRouter` utility to define typed routes.

**Primary recommendation:** Clone task-runner plugin structure, create SITE_BUILDER_BINDING for connection filtering, and implement site detection utility based on file existence checks via OBJECT_STORAGE_BINDING tools.

## Standard Stack

The established libraries/tools for Mesh plugin development:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI framework | Latest stable, used across all Mesh UI |
| TanStack Router | 1.139.7 | Client-side routing | Type-safe routing with validated search params |
| TanStack Query | 5.90.11 | Server state management | Async state, caching, refetching patterns |
| TypeScript | 5.9.3 | Type safety | Strict typing throughout codebase |
| Zod | 4.0.0 | Schema validation | Runtime validation for tool schemas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix UI | 1.x | Unstyled UI primitives | All interactive components (dropdown, dialog, etc.) |
| @untitledui/icons | 0.0.19 | Icon library | Consistent icons across plugins |
| Hono | 4.10.7 | HTTP server (backend) | For server-side routes (not used in plugins) |
| Vite | 7.2.1 | Build tool | Development and bundling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Router | React Router | TanStack has better TypeScript inference and search param validation |
| TanStack Query | SWR or RTK Query | TanStack Query is already established in codebase |
| Radix UI | Headless UI | Radix is more comprehensive and better maintained |

**Installation:**
```bash
# Plugin dependencies inherit from workspace
# Add to packages/mesh-plugin-site-builder/package.json
{
  "dependencies": {
    "@decocms/bindings": "workspace:*",
    "@deco/ui": "workspace:*",
    "@tanstack/react-query": "5.90.11",
    "@untitledui/icons": "^0.0.19",
    "react": "^19.2.0",
    "zod": "^4.0.0"
  }
}
```

## Architecture Patterns

### Recommended Project Structure
```
packages/mesh-plugin-site-builder/
├── package.json                 # Dependencies (minimal, workspace:*)
├── tsconfig.json               # Extends root config
├── index.tsx                   # Plugin definition & registration
├── components/
│   ├── plugin-header.tsx       # Connection selector
│   ├── plugin-empty-state.tsx  # No connections state
│   ├── site-list.tsx          # List view (future)
│   └── site-detail.tsx        # Detail view with preview
├── hooks/
│   └── use-site.ts            # Site-specific state
└── lib/
    ├── router.ts              # TanStack Router config
    ├── query-keys.ts          # Query key factory
    └── stack-detection.ts     # deno.json detection logic
```

### Pattern 1: Plugin Definition with Binding
**What:** Plugin exports an object implementing the `Plugin<TBinding>` interface
**When to use:** Every plugin must define this at the entry point
**Example:**
```typescript
// Source: mesh-plugin-task-runner/index.tsx
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import type { Plugin, PluginSetupContext } from "@decocms/bindings/plugins";

export const siteBuilderPlugin: Plugin<typeof SITE_BUILDER_BINDING> = {
  id: "site-builder",
  description: "AI-assisted site building with live preview",
  binding: SITE_BUILDER_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    const { registerRootSidebarItem, registerPluginRoutes } = context;

    registerRootSidebarItem({
      icon: <Globe01 size={20} />,
      label: "Sites",
    });

    const routes = siteBuilderRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};
```

### Pattern 2: Custom Binding Definition
**What:** Define a binding as a readonly array of ToolBinder objects with Zod schemas
**When to use:** When filtering connections by specific tool requirements
**Example:**
```typescript
// Source: packages/bindings/src/well-known/object-storage.ts pattern
import { z } from "zod";
import { type Binder, type ToolBinder } from "@decocms/bindings";

// For site detection, we need file reading from OBJECT_STORAGE_BINDING
// plus optional GET_ROOT to get workspace path
export const SITE_BUILDER_BINDING = [
  // Inherit from OBJECT_STORAGE_BINDING
  ...OBJECT_STORAGE_BINDING,
  // Add optional site-specific tools if needed
] as const satisfies Binder;

export type SiteBuilderBinding = typeof SITE_BUILDER_BINDING;
```

### Pattern 3: Typed Router with createPluginRouter
**What:** Use `createPluginRouter` utility to define routes with validated search params
**When to use:** Every plugin with navigation needs this
**Example:**
```typescript
// Source: mesh-plugin-task-runner/lib/router.ts
import { createPluginRouter } from "@decocms/bindings/plugins";
import * as z from "zod";

const siteDetailSearchSchema = z.object({
  page: z.string().optional(), // Current page route
  devServer: z.enum(["stopped", "starting", "running"]).optional(),
});

export const siteBuilderRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const indexRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/site-list")),
  });

  const detailRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/$connectionId",
    component: lazyRouteComponent(() => import("../components/site-detail")),
    validateSearch: siteDetailSearchSchema,
  });

  return [indexRoute, detailRoute];
});
```

### Pattern 4: usePluginContext Hook
**What:** Access connection, toolCaller, and session from plugin context
**When to use:** Every component/hook that needs to call MCP tools
**Example:**
```typescript
// Source: mesh-plugin-task-runner/hooks/use-tasks.ts
import { usePluginContext } from "@decocms/bindings/plugins";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";

export function useSiteDetection() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof SITE_BUILDER_BINDING>();

  return useQuery({
    queryKey: ["site-detection", connectionId],
    queryFn: async () => {
      // Check if read_file tool is available (not in binding, but common)
      const hasReadFile = connection?.tools?.some((t) => t.name === "read_file");

      if (!hasReadFile) {
        return { isSite: false, stack: null };
      }

      try {
        // Cast for untyped tools
        const untypedToolCaller = toolCaller as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ content?: string } | string>;

        const result = await untypedToolCaller("read_file", {
          path: "deno.json",
        });

        const content = typeof result === "string"
          ? result
          : result?.content;

        if (!content) return { isSite: false, stack: null };

        const parsed = JSON.parse(content);
        const hasDeco = parsed.imports?.["deco/"] ||
                       parsed.imports?.deco ||
                       JSON.stringify(parsed).includes("deco/");

        return {
          isSite: hasDeco,
          stack: hasDeco ? "deno-deco" : "deno"
        };
      } catch {
        return { isSite: false, stack: null };
      }
    },
    enabled: !!connectionId && !!toolCaller,
  });
}
```

### Pattern 5: Lazy Loading Components
**What:** Use React.lazy() for plugin components to reduce initial bundle
**When to use:** All route components and heavy UI components
**Example:**
```typescript
// Source: mesh-plugin-task-runner/index.tsx
import { lazy } from "react";

const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));
```

### Anti-Patterns to Avoid
- **Direct MCP client usage:** Always use `toolCaller` from `usePluginContext`, never create MCP clients directly
- **Hardcoded tool names:** Use binding definitions to ensure type safety
- **Missing error boundaries:** All plugin components should handle tool errors gracefully
- **Blocking file checks:** Use TanStack Query for async operations, never block rendering
- **Coupling to specific MCPs:** Plugins should work with any connection implementing the binding

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection dropdown | Custom dropdown with state | Reuse task-runner's PluginHeader pattern | Already handles multi-connection, single-connection, icons, blur events |
| Query key management | String literals scattered | Query key factory pattern (KEYS object) | Type-safe, DRY, easy refactoring |
| Route type safety | Manual type guards | TanStack Router's validateSearch | Runtime validation + TypeScript inference |
| Tool schema validation | Manual JSON parsing | Zod schemas in binding definition | Runtime validation, type inference, error messages |
| Empty state UI | Custom empty component | @deco/ui EmptyState component | Consistent UX across plugins |
| File existence checks | Custom helper | OBJECT_STORAGE_BINDING's LIST_OBJECTS | Handles pagination, errors, prefixes correctly |

**Key insight:** The bindings system is designed to abstract MCP tool calling. Never bypass it by creating raw MCP clients or hardcoding tool schemas. The task-runner plugin demonstrates all the patterns needed - clone its structure rather than inventing new approaches.

## Common Pitfalls

### Pitfall 1: Connection Filtering Logic in Component
**What goes wrong:** Filtering connections in UI components leads to flickering and race conditions
**Why it happens:** Connection list can update while user is interacting with dropdown
**How to avoid:** Filter connections at plugin registration time using binding requirements
**Warning signs:** `connections.filter()` in render methods, or conditional rendering based on runtime checks

### Pitfall 2: Assuming Tools Exist Without Checking
**What goes wrong:** Plugin crashes when connection doesn't implement optional tools
**Why it happens:** Not all OBJECT_STORAGE_BINDING implementations provide read_file, GET_ROOT, etc.
**How to avoid:** Always check `connection?.tools?.some((t) => t.name === "tool_name")` before calling untyped tools
**Warning signs:** Errors like "Tool not found" or undefined tool results

### Pitfall 3: Synchronous File Detection
**What goes wrong:** UI blocks or shows stale detection state
**Why it happens:** File reading is async but treated as sync
**How to avoid:** Use TanStack Query with proper loading/error states
**Warning signs:** Blank screens, "Loading..." that never completes, or stale connection badges

### Pitfall 4: Breaking Type Safety with Tool Calls
**What goes wrong:** Runtime errors when tool response shape changes
**Why it happens:** Casting to `unknown` loses all type safety
**How to avoid:** Define explicit types for untyped tool responses and validate with Zod
**Warning signs:** `as unknown as any`, runtime TypeErrors on response access

### Pitfall 5: Route Param Mismatch
**What goes wrong:** Navigation breaks or shows wrong connection
**Why it happens:** TanStack Router params don't match URL structure
**How to avoid:** Use `$connectionId` pattern in route path and access via `useParams()`
**Warning signs:** 404 on navigation, or detail view shows wrong data

### Pitfall 6: Query Key Collisions
**What goes wrong:** Different plugins fetch same data, causing cache conflicts
**Why it happens:** Using generic query keys like `["workspace"]`
**How to avoid:** Prefix all query keys with plugin ID: `["site-builder", "workspace", connectionId]`
**Warning signs:** Data from one plugin appearing in another, or stale data after connection change

## Code Examples

Verified patterns from official sources:

### Connection Dropdown with Icons
```typescript
// Source: mesh-plugin-task-runner/components/plugin-header.tsx
import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import { Globe01, ChevronDown, Check } from "@untitledui/icons";

function ConnectionSelector({
  connections,
  selectedConnectionId,
  onConnectionChange,
}: PluginRenderHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedConnection = connections.find(
    (c) => c.id === selectedConnectionId,
  );

  // Single connection - show static label
  if (connections.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {selectedConnection?.icon ? (
          <img src={selectedConnection.icon} alt="" className="size-4 rounded" />
        ) : (
          <Globe01 size={16} />
        )}
        <span>{selectedConnection?.title || "Site"}</span>
      </div>
    );
  }

  // Multiple connections - show dropdown
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border"
      >
        {selectedConnection?.icon && (
          <img src={selectedConnection.icon} alt="" className="size-4 rounded" />
        )}
        <span>{selectedConnection?.title || "Select site"}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-48 rounded-md border bg-popover p-1 shadow-md">
          {connections.map((connection) => (
            <button
              key={connection.id}
              onClick={() => {
                onConnectionChange(connection.id);
                setIsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
            >
              {connection.icon && (
                <img src={connection.icon} alt="" className="size-4 rounded" />
              )}
              <span className="flex-1 text-left">{connection.title}</span>
              {connection.id === selectedConnectionId && (
                <Check size={14} className="text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Query Key Factory Pattern
```typescript
// Source: mesh-plugin-task-runner/lib/query-keys.ts
export const KEYS = {
  all: ["site-builder"] as const,
  workspace: ["site-builder", "workspace"] as const,
  siteDetection: (connectionId: string) =>
    ["site-builder", "site-detection", connectionId] as const,
  devServer: (connectionId: string) =>
    ["site-builder", "dev-server", connectionId] as const,
  pages: (connectionId: string) =>
    ["site-builder", "pages", connectionId] as const,
};

// Usage:
useQuery({
  queryKey: KEYS.siteDetection(connectionId),
  queryFn: async () => { /* ... */ },
});
```

### Stack Detection from deno.json
```typescript
// Source: Mesh task-runner patterns + PROJECT.md requirements
export async function detectDecoSite(
  toolCaller: (name: string, args: unknown) => Promise<unknown>,
): Promise<{ isSite: boolean; stack: string | null }> {
  try {
    // Try deno.json first
    const result = await toolCaller("read_file", { path: "deno.json" });
    const content = typeof result === "string"
      ? result
      : (result as { content?: string })?.content;

    if (!content) return { isSite: false, stack: null };

    const config = JSON.parse(content);

    // Check for deco import
    const imports = config.imports || {};
    const hasDeco =
      imports["deco/"] ||
      imports.deco ||
      Object.values(imports).some((val: unknown) =>
        typeof val === "string" && val.includes("deco")
      );

    if (hasDeco) {
      return { isSite: true, stack: "deno-deco" };
    }

    return { isSite: false, stack: "deno" };
  } catch {
    return { isSite: false, stack: null };
  }
}
```

### Untyped Tool Calling Pattern
```typescript
// Source: mesh-plugin-task-runner/hooks/use-tasks.ts
// When calling tools not in the binding (like read_file)
const { toolCaller, connection } = usePluginContext<typeof BINDING>();

// Check tool availability first
const hasReadFile = connection?.tools?.some((t) => t.name === "read_file");

if (!hasReadFile) {
  throw new Error("Connection doesn't support read_file");
}

// Cast to untyped caller
const untypedToolCaller = toolCaller as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ content?: string } | string>;

// Call with explicit args
const result = await untypedToolCaller("read_file", {
  path: "deno.json",
});

// Handle both response shapes (MCP varies)
const content = typeof result === "string"
  ? result
  : result?.content;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Router v6 | TanStack Router v1 | Mesh v2.x | Better TypeScript, search param validation |
| TanStack Query v4 | TanStack Query v5 | 2024 | New API, better suspense support |
| React 18 | React 19 | Jan 2025 | Compiler, improved hooks |
| Zod 3.x | Zod 4.x | 2025 | Breaking changes in schema composition |
| Custom routing utils | createPluginRouter | Mesh v2.x | Standardized plugin routing |

**Deprecated/outdated:**
- LayoutComponent prop: Use renderHeader and renderEmptyState instead
- Direct binding tool calls: Always use toolCaller from context
- Manual route registration: Use createPluginRouter utility

## Open Questions

1. **Connection filtering at registration vs runtime**
   - What we know: Bindings filter by tool requirements, plugins receive filtered list
   - What's unclear: Can plugins do additional filtering (e.g., by file detection)?
   - Recommendation: Use binding for tool requirements, add runtime check in renderHeader for deno.json detection

2. **Handling multiple local-fs connections**
   - What we know: OBJECT_STORAGE_BINDING allows any local-fs connection
   - What's unclear: How to differentiate between site folders vs generic folders in dropdown?
   - Recommendation: Add badge or icon indicator based on site detection query result

3. **Error handling for missing tools**
   - What we know: Not all OBJECT_STORAGE implementations have read_file
   - What's unclear: Should plugin show in sidebar if no connections support read_file?
   - Recommendation: Show empty state with "Connect a local-fs MCP" message

## Sources

### Primary (HIGH confidence)
- `/Users/guilherme/Projects/mesh/packages/mesh-plugin-task-runner/` - Complete working plugin implementation
- `/Users/guilherme/Projects/mesh/packages/bindings/src/well-known/` - Binding pattern definitions
- `/Users/guilherme/Projects/mesh/packages/bindings/src/core/plugins.ts` - Plugin interface definition
- `/Users/guilherme/Projects/mesh/apps/mesh/package.json` - Current library versions
- `/Users/guilherme/Projects/mesh/.planning/PROJECT.md` - Project requirements
- `/Users/guilherme/Projects/mesh/.planning/ROADMAP.md` - Phase specifications

### Secondary (MEDIUM confidence)
- Codebase patterns observed across multiple files (connection dropdown, query keys, router setup)

### Tertiary (LOW confidence)
- None - all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified from package.json files
- Architecture: HIGH - Extracted from working task-runner plugin
- Pitfalls: HIGH - Observed from existing code patterns and anti-patterns avoided

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - stable patterns)

**Notes:**
- React 19 is very new (released Jan 2025), but codebase already migrated
- TanStack Router v1 is stable and well-established in the codebase
- All patterns are production-tested in task-runner plugin
- Stack detection logic is custom to this project (not a standard library)

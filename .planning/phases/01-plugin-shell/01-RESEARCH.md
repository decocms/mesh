# Phase 1: Plugin Shell - Research

**Researched:** 2026-02-14
**Domain:** Mesh plugin system (ServerPlugin + ClientPlugin), MCP binding pattern, file operations via MCP, tunnel for local dev preview
**Confidence:** HIGH

## Summary

Phase 1 creates the CMS plugin skeleton in Mesh: a `ServerPlugin` (tools, migrations, events) and `ClientPlugin` (sidebar, routes, UI) following the exact patterns of existing plugins like `mesh-plugin-object-storage` and `mesh-plugin-workflows`. The plugin declares a `SITE_BINDING` (analogous to `OBJECT_STORAGE_BINDING`) that requires `READ_FILE`, `PUT_FILE`, and `LIST_FILES` capabilities. All file operations for page CRUD flow through MCP connections implementing this binding. Page configs are stored as JSON files in `.deco/pages/` inside the user's project directory.

The local-fs MCP connection is the mechanism that connects Mesh to the user's local project folder. The user creates a Site project in Mesh, then configures a connection to a local-fs MCP server pointed at their project folder. This MCP server implements the SITE_BINDING by exposing READ_FILE, PUT_FILE, LIST_FILES tools that operate on the local filesystem. The existing deconfig CLI (`deco-cli`) already demonstrates this pattern with its `READ_FILE`/`PUT_FILE`/`LIST_FILES` tool calls.

For local preview, the `deco-cli link` command creates a warp tunnel (via `@deco-cx/warp-node`) that makes a local dev server accessible at a public URL. The CMS plugin can embed this URL in an iframe for live preview.

**Primary recommendation:** Build the plugin package (`mesh-plugin-site-editor`) as a new workspace package under `packages/`, following the exact structure of `mesh-plugin-workflows` (separate `server/` and `client/` entry points). Define `SITE_BINDING` in `@decocms/bindings/well-known/` following the `OBJECT_STORAGE_BINDING` pattern. Page CRUD tools are server-plugin tools that proxy file operations through the MCP connection.

## Standard Stack

### Core (Already in Mesh -- zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@decocms/bindings` | workspace:* | Plugin interfaces (ServerPlugin, ClientPlugin, Binder, ToolBinder) | All plugins use this |
| `@decocms/mesh-sdk` | workspace:* | React hooks (usePluginContext, useMCPClient), types | All client plugins use this |
| `@deco/ui` | workspace:* | shadcn-based UI components | Consistent UI across plugins |
| `zod` | 4.0.0 | Schema validation for tool inputs/outputs | All tools use Zod schemas |
| `@tanstack/react-router` | 1.139.7 | Plugin route registration | createPluginRouter pattern |
| `@tanstack/react-query` | 5.90.11 | Data fetching and caching | Standard for all plugin UIs |
| `react` | 19.2.0 | UI framework | Required |
| `@untitledui/icons` | 0.0.19 | Icon library | Used by all plugins |
| `@deco-cx/warp-node` | 0.3.16 | Tunnel for local dev preview | Already in deco-cli |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 5.1.6 | Generate unique page IDs | When creating new pages |
| `kysely` | 0.28.8 | Database migrations (if plugin needs DB tables) | For storing site metadata |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SITE_BINDING (new) | Reuse OBJECT_STORAGE_BINDING | OBJECT_STORAGE_BINDING is S3-specific (presigned URLs, HEAD operations). SITE_BINDING needs semantic file ops (READ_FILE, PUT_FILE, LIST_FILES). Different contract. |
| Server-side page CRUD tools | Client-side direct MCP calls | Server tools provide org-gating, access control, and audit logging automatically via plugin-loader |

## Architecture Patterns

### Recommended Project Structure

```
packages/mesh-plugin-site-editor/
  package.json
  tsconfig.json
  shared.ts                    # PLUGIN_ID, PLUGIN_DESCRIPTION constants
  server/
    index.ts                   # ServerPlugin export
    tools/
      index.ts                 # All tools array
      page-list.ts             # LIST_PAGES tool
      page-get.ts              # GET_PAGE tool
      page-create.ts           # CREATE_PAGE tool
      page-update.ts           # UPDATE_PAGE tool
      page-delete.ts           # DELETE_PAGE tool
    migrations/
      index.ts                 # Migration array (if DB tables needed)
  client/
    index.tsx                  # ClientPlugin export
    components/
      plugin-header.tsx        # Header with connection display
      plugin-empty-state.tsx   # Empty state when no connection
      pages-list.tsx           # Pages list view
      page-editor.tsx          # Page edit form
      preview-panel.tsx        # iframe preview of local dev server
    lib/
      router.ts                # createPluginRouter with routes
      query-keys.ts            # React Query keys
```

Also add to `packages/bindings/src/well-known/`:
```
site.ts                        # SITE_BINDING definition
```

### Pattern 1: SITE_BINDING Definition (Well-Known Binding)

**What:** Define SITE_BINDING as a Binder array of ToolBinder entries, following the OBJECT_STORAGE_BINDING pattern exactly.
**When to use:** Always -- this is how Mesh filters compatible connections for the plugin.
**Why:** The plugin layout (`PluginLayout`) uses `connectionImplementsBinding()` to find connections that implement the binding. Only connections whose tools match the binding's tool names will appear as valid for the plugin.

```typescript
// Source: packages/bindings/src/well-known/object-storage.ts pattern
import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

const ReadFileInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
});
const ReadFileOutputSchema = z.object({
  content: z.string().describe("File content (base64 encoded)"),
});

const PutFileInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  content: z.object({
    base64: z.string().describe("Base64-encoded file content"),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const PutFileOutputSchema = z.object({
  success: z.boolean(),
});

const ListFilesInputSchema = z.object({
  prefix: z.string().optional().describe("Path prefix filter"),
});
const ListFilesOutputSchema = z.object({
  files: z.record(z.string(), z.object({
    address: z.string(),
    sizeInBytes: z.number(),
    mtime: z.number(),
    ctime: z.number(),
    metadata: z.record(z.string(), z.unknown()),
  })),
  count: z.number(),
});

export const SITE_BINDING = [
  {
    name: "READ_FILE" as const,
    inputSchema: ReadFileInputSchema,
    outputSchema: ReadFileOutputSchema,
  } satisfies ToolBinder<"READ_FILE">,
  {
    name: "PUT_FILE" as const,
    inputSchema: PutFileInputSchema,
    outputSchema: PutFileOutputSchema,
  } satisfies ToolBinder<"PUT_FILE">,
  {
    name: "LIST_FILES" as const,
    inputSchema: ListFilesInputSchema,
    outputSchema: ListFilesOutputSchema,
  } satisfies ToolBinder<"LIST_FILES">,
] as const satisfies Binder;

export type SiteBinding = typeof SITE_BINDING;
```

### Pattern 2: ServerPlugin Tool Definition

**What:** Each page CRUD operation is a `ServerPluginToolDefinition` with Zod input/output schemas and a handler that proxies file operations through the MCP connection.
**When to use:** All server-side tools.
**Why:** The plugin-loader wraps each tool with org-enabled gating and access control automatically.

```typescript
// Source: packages/mesh-plugin-workflows/server/tools/workflow-collection.ts pattern
import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const PAGE_LIST: ServerPluginToolDefinition = {
  name: "CMS_PAGE_LIST",
  description: "List all pages in .deco/pages/",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
  }),
  outputSchema: z.object({
    pages: z.array(z.object({
      id: z.string(),
      path: z.string(),
      title: z.string().optional(),
    })),
  }),
  handler: async (input, ctx) => {
    const { connectionId } = input as { connectionId: string };
    const proxy = await ctx.createMCPProxy(connectionId);
    try {
      const result = await proxy.callTool({
        name: "LIST_FILES",
        arguments: { prefix: ".deco/pages/" },
      });
      // Parse result, extract page metadata from file listing
      const files = (result.structuredContent as any)?.files ?? {};
      const pages = Object.keys(files)
        .filter(p => p.endsWith(".json"))
        .map(p => ({ id: p, path: p, title: p }));
      return { pages };
    } finally {
      await proxy.close?.();
    }
  },
};
```

### Pattern 3: ClientPlugin with Setup (Sidebar + Routes)

**What:** Client plugin registers sidebar groups and routes via `setup()`.
**When to use:** Always for plugins that have UI.
**Why:** This is how the dynamic plugin layout discovers and renders plugin UI.

```typescript
// Source: packages/mesh-plugin-object-storage/index.tsx pattern
import type { Plugin, PluginSetupContext } from "@decocms/bindings/plugins";
import { SITE_BINDING } from "@decocms/bindings/site";
import { siteEditorRouter } from "./lib/router";

export const clientPlugin: Plugin<typeof SITE_BINDING> = {
  id: "site-editor",
  description: "CMS for managing site pages, sections, and loaders",
  binding: SITE_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    const { registerSidebarGroup, registerPluginRoutes } = context;

    registerSidebarGroup({
      id: "site-editor",
      label: "CMS",
      items: [
        { icon: <FileIcon size={16} />, label: "Pages" },
        { icon: <LayoutIcon size={16} />, label: "Sections" },
        { icon: <DatabaseIcon size={16} />, label: "Loaders" },
      ],
      defaultExpanded: true,
    });

    const routes = siteEditorRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};
```

### Pattern 4: Plugin Router with Multiple Routes

**What:** Use `createPluginRouter()` to define typed routes with search params.
**When to use:** Any plugin with multiple pages.
**Why:** Provides typed navigation hooks (`useParams`, `useSearch`, `useNavigate`) scoped to the plugin.

```typescript
// Source: packages/mesh-plugin-object-storage/lib/router.ts pattern
import { createPluginRouter } from "@decocms/bindings/plugins";
import * as z from "zod";

export const siteEditorRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const pagesRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/pages-list")),
  });

  const pageEditRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/pages/$pageId",
    component: lazyRouteComponent(() => import("../components/page-editor")),
  });

  const sectionsRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/sections",
    component: lazyRouteComponent(() => import("../components/sections-list")),
  });

  const loadersRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/loaders",
    component: lazyRouteComponent(() => import("../components/loaders-list")),
  });

  return [pagesRoute, pageEditRoute, sectionsRoute, loadersRoute];
});
```

### Pattern 5: Plugin Registration (Server + Client)

**What:** Register the plugin in both `apps/mesh/src/server-plugins.ts` and `apps/mesh/src/web/plugins.ts`.
**When to use:** Always when adding a new plugin.
**Why:** These are the central registries that the plugin-loader and web UI discover from.

```typescript
// apps/mesh/src/server-plugins.ts -- add import + entry
import { serverPlugin as siteEditorPlugin } from "mesh-plugin-site-editor/server";
export const serverPlugins: ServerPlugin[] = [
  // ... existing plugins
  siteEditorPlugin,
];

// apps/mesh/src/web/plugins.ts -- add import + entry
import { clientPlugin as siteEditorPlugin } from "mesh-plugin-site-editor/client";
export const sourcePlugins: AnyClientPlugin[] = [
  // ... existing plugins
  siteEditorPlugin,
];
```

### Pattern 6: Page JSON Schema (`.deco/pages/`)

**What:** Pages are stored as JSON files in `.deco/pages/` in the user's project.
**When to use:** All page CRUD operations.
**Why:** Git-backed, branch-aware, diffable, version-controlled content.

```json
{
  "id": "page_abc123",
  "path": "/",
  "title": "Home",
  "blocks": [
    {
      "id": "block_xyz",
      "contentType": "sections/Hero",
      "inputType": "static",
      "input": {
        "title": "Welcome",
        "subtitle": "Build faster",
        "ctaText": "Get Started"
      }
    }
  ],
  "metadata": {
    "description": "Landing page",
    "createdAt": "2026-02-14T00:00:00Z",
    "updatedAt": "2026-02-14T00:00:00Z"
  }
}
```

This aligns with the `PageSchema` defined in `site-binding-renderer/dist/src/bindings/site.d.ts` which defines: `id`, `path`, `title`, `blocks` (array of `ContentBlock`), and `metadata`.

### Anti-Patterns to Avoid

- **Storing page content in the Mesh database:** Page configs MUST live in the user's project files (`.deco/pages/`) via MCP, not in Mesh's Postgres. The Mesh DB is only for operational metadata (which connection a project uses, sync state).
- **Direct filesystem access from server plugin:** All file reads/writes MUST go through the MCP connection's tools (READ_FILE, PUT_FILE, LIST_FILES). The server plugin uses `ctx.createMCPProxy(connectionId)` to call these tools. Never import `fs` directly.
- **Combining server and client code in one entry point:** Server plugin (`./server/index.ts`) and client plugin (`./client/index.tsx`) MUST be separate entry points to avoid bundling server code into the client.
- **Hardcoding the connection ID:** The connection ID is resolved at runtime by the plugin layout based on project settings. The client gets it from `usePluginContext()`. Server tools receive it as an input parameter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Binding definition | Custom connection filtering | `SITE_BINDING` as `Binder` + `connectionImplementsBinding()` | Mesh's plugin layout handles filtering automatically |
| Plugin context | Custom React context | `PluginContextProvider` + `usePluginContext<typeof SITE_BINDING>()` | Provides typed toolCaller, org, session |
| Route registration | Manual TanStack Router wiring | `createPluginRouter()` | Handles plugin path prefixing, typed params/search |
| MCP proxy creation | Direct MCP client | `ctx.createMCPProxy(connectionId)` | Handles auth, encryption, transport |
| Tool org gating | Custom permission checks | Plugin-loader's `withPluginEnabled()` wrapper | Automatic org-enabled check on all plugin tools |
| Tunnel | Custom WebSocket proxy | `@deco-cx/warp-node` + `deco link` CLI command | Already tested, handles reconnection, clipboard copy |
| Plugin sidebar | Custom sidebar component | `registerSidebarGroup()` in plugin `setup()` | Integrates with Mesh's existing sidebar system |

**Key insight:** The Mesh plugin system provides virtually every infrastructure piece needed. The CMS plugin adds domain-specific tools and UI on top, not new infrastructure.

## Common Pitfalls

### Pitfall 1: Forgetting to Register in Both Server and Client Registries

**What goes wrong:** Plugin tools work but UI doesn't appear, or UI appears but tools fail.
**Why it happens:** Server plugins (`server-plugins.ts`) and client plugins (`web/plugins.ts`) are separate registries.
**How to avoid:** Always add to both files. Verify by checking both `serverPlugins` and `sourcePlugins` arrays.
**Warning signs:** "Plugin not enabled" errors from server, or plugin not appearing in sidebar.

### Pitfall 2: Binding Tool Names Must Match Exactly

**What goes wrong:** Plugin shows "Not Configured" even when a connection with READ_FILE/PUT_FILE/LIST_FILES exists.
**Why it happens:** `connectionImplementsBinding()` checks tool names with exact match (or regex). If the MCP server exposes tools with different names (e.g., `read_file` instead of `READ_FILE`), the binding check fails.
**How to avoid:** Verify the exact tool names exposed by the local-fs MCP server match the SITE_BINDING definition.
**Warning signs:** `validConnections` is empty in the plugin layout despite connections existing.

### Pitfall 3: MCP Proxy Must Be Closed After Use

**What goes wrong:** Connection leaks, resource exhaustion.
**Why it happens:** `ctx.createMCPProxy()` creates a new connection to the downstream MCP server. If not closed, it stays open.
**How to avoid:** Always use try/finally with `proxy.close?.()` in server tool handlers.
**Warning signs:** Growing number of open connections, eventual connection failures.

### Pitfall 4: Base64 Encoding for File Content

**What goes wrong:** File content is corrupted or unreadable.
**Why it happens:** The deconfig MCP tools use base64 encoding for file content (both READ_FILE response and PUT_FILE request). Forgetting to encode/decode results in garbled data.
**How to avoid:** Always use `Buffer.from(content, "base64")` for reads and `Buffer.from(content).toString("base64")` for writes.
**Warning signs:** JSON parse errors when reading page configs, or page configs with garbage content.

### Pitfall 5: Plugin Routes Must Be Under parentRoute

**What goes wrong:** Routes 404 or render outside the plugin layout.
**Why it happens:** All plugin routes must use `getParentRoute: () => ctx.parentRoute` to be registered under the dynamic plugin layout route (`/$org/$project/$pluginId/*`).
**How to avoid:** Always use `ctx.parentRoute` in `createPluginRouter`, never reference routes from `apps/mesh/src/web/index.tsx`.
**Warning signs:** 404 when navigating to plugin pages, or pages rendering without the plugin layout.

### Pitfall 6: Sidebar Items Count Must Match Route Count

**What goes wrong:** Sidebar shows items but clicking them doesn't navigate anywhere.
**Why it happens:** `registerSidebarGroup` items are purely visual labels. The actual navigation happens through routes. If sidebar items don't have corresponding routes, clicks go nowhere.
**How to avoid:** Ensure every sidebar item label corresponds to a registered plugin route. The sidebar items are ordered by position, and clicking the Nth item navigates to the Nth route.
**Warning signs:** Sidebar items appear but clicking does nothing or navigates to wrong page.

## Code Examples

### Complete ServerPlugin Registration

```typescript
// Source: mesh-plugin-workflows/server/index.ts pattern
import type { ServerPlugin } from "@decocms/bindings/server-plugin";

export const serverPlugin: ServerPlugin = {
  id: "site-editor",
  description: "CMS for managing site pages and content",
  tools: [
    // Array of ServerPluginToolDefinition
    PAGE_LIST,
    PAGE_GET,
    PAGE_CREATE,
    PAGE_UPDATE,
    PAGE_DELETE,
  ],
  // No migrations needed for Phase 1 (all data in files via MCP)
  // No events needed for Phase 1
  // No storage needed for Phase 1 (no DB tables)
};
```

### Using usePluginContext in Plugin Components

```typescript
// Source: @decocms/mesh-sdk/plugins pattern
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import type { SiteBinding } from "@decocms/bindings/site";

function PagesList() {
  const { toolCaller, connection } = usePluginContext<SiteBinding>();

  // toolCaller is typed -- only accepts "READ_FILE", "PUT_FILE", "LIST_FILES"
  const listPages = async () => {
    const result = await toolCaller("LIST_FILES", {
      prefix: ".deco/pages/",
    });
    return result;
  };
}
```

### Tunnel Setup for Local Preview

```typescript
// The tunnel is set up by the user via CLI:
// deco dev (or deco link)
//
// This creates a warp tunnel from localhost:PORT to a public URL like:
// https://{workspace}-{app}.deco.site
//
// The plugin embeds this URL in an iframe:
function PreviewPanel({ tunnelUrl }: { tunnelUrl: string }) {
  return (
    <iframe
      src={tunnelUrl}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plugin with LayoutComponent (deprecated) | ClientPlugin with renderHeader + renderEmptyState | Recent | Use renderHeader/renderEmptyState pattern, not LayoutComponent |
| Plugin context in @decocms/bindings | Plugin context in @decocms/mesh-sdk/plugins | Recent | Import usePluginContext from @decocms/mesh-sdk/plugins |
| Direct connection selector in plugin | Connection configured via project settings | Recent | Plugin layout reads connection from PROJECT_PLUGIN_CONFIG_GET tool |
| Plugin binding: empty array | Plugin binding: specific Binder | Current | Plugins without binding (like workflows) show for all connections; plugins with binding filter connections |

**Deprecated/outdated:**
- `LayoutComponent` on ClientPlugin: Use `renderHeader` + `renderEmptyState` instead
- `Plugin` interface (with required setup): Use `ClientPlugin` instead (setup is optional)
- Plugin context from `@decocms/bindings`: Use `@decocms/mesh-sdk/plugins` instead

## Open Questions

1. **Local-fs MCP server implementation**
   - What we know: The deconfig CLI already uses READ_FILE, PUT_FILE, LIST_FILES tool calls against a remote MCP server. The SITE_BINDING needs these same tools but against a local filesystem.
   - What's unclear: Does a local-fs MCP server already exist that exposes these exact tool names? Or does it need to be built? The user might be running a generic filesystem MCP server (like the `@modelcontextprotocol/server-filesystem`) that uses different tool names.
   - Recommendation: Research if there's an existing local-fs MCP server in the Mesh ecosystem. If not, the SITE_BINDING tool names should match whatever the standard local-fs MCP server exposes. Alternatively, the CLI `deco dev` command could start a local-fs MCP server as part of the dev setup.

2. **Tunnel URL discovery**
   - What we know: The `deco link` command creates a tunnel and prints the URL. The URL follows the pattern `https://{workspace}-{app}.deco.site`.
   - What's unclear: How does the CMS plugin discover the tunnel URL? Is it stored somewhere (project settings, connection metadata)? Or does the user manually enter it?
   - Recommendation: Store the tunnel URL in the project's connection metadata or plugin config. The `deco dev` command could automatically update this when the tunnel starts.

3. **Sidebar navigation routing**
   - What we know: `registerSidebarGroup` registers visual items. Routes are registered separately via `registerPluginRoutes`.
   - What's unclear: The exact mapping between sidebar item clicks and route navigation. Looking at the object-storage plugin, it only has one sidebar item and one route. With multiple sidebar items (Pages, Sections, Loaders), we need to understand how sidebar item index maps to route.
   - Recommendation: Investigate how the sidebar renders plugin groups and how clicks navigate. May need to look at the sidebar component source.

4. **Branch awareness**
   - What we know: Deconfig MCP tools accept a `branch` parameter. Pages should be branch-aware for git workflows.
   - What's unclear: Should the SITE_BINDING tools include a branch parameter? Or is branch selection handled at the connection level?
   - Recommendation: For Phase 1, use a default branch (main/master). Branch selection can be added in later phases.

## Sources

### Primary (HIGH confidence)
- `packages/bindings/src/core/server-plugin.ts` -- ServerPlugin interface with tools, routes, migrations, events, onStartup
- `packages/bindings/src/core/plugins.ts` -- ClientPlugin interface with binding, setup, renderHeader, renderEmptyState
- `packages/bindings/src/core/binder.ts` -- Binder, ToolBinder types and connectionImplementsBinding
- `packages/bindings/src/core/plugin-router.tsx` -- createPluginRouter with typed hooks
- `packages/bindings/src/well-known/object-storage.ts` -- OBJECT_STORAGE_BINDING reference pattern
- `packages/mesh-plugin-object-storage/index.tsx` -- ClientPlugin with binding, setup, sidebar, routes
- `packages/mesh-plugin-object-storage/lib/router.ts` -- createPluginRouter usage
- `packages/mesh-plugin-workflows/server/index.ts` -- Complete ServerPlugin with tools, migrations, events
- `packages/mesh-plugin-workflows/server/tools/workflow-collection.ts` -- ServerPluginToolDefinition pattern
- `packages/mesh-plugin-workflows/client/index.tsx` -- ClientPlugin without binding
- `apps/mesh/src/server-plugins.ts` -- Server plugin registration
- `apps/mesh/src/web/plugins.ts` -- Client plugin registration
- `apps/mesh/src/core/plugin-loader.ts` -- Plugin loader with tool gating, route mounting, event routing
- `apps/mesh/src/web/index.tsx` -- Plugin route tree and sidebar setup
- `apps/mesh/src/web/layouts/plugin-layout.tsx` -- Plugin layout with binding filtering and context
- `apps/mesh/src/web/layouts/dynamic-plugin-layout.tsx` -- Dynamic plugin layout dispatch
- `packages/mesh-sdk/src/plugins/plugin-context-provider.tsx` -- usePluginContext hook
- `packages/cli/src/commands/deconfig/base.ts` -- READ_FILE, PUT_FILE, LIST_FILES via MCP
- `packages/cli/src/commands/dev/link.ts` -- Tunnel via @deco-cx/warp-node
- `packages/site-binding-renderer/dist/src/bindings/site.d.ts` -- PageSchema, ContentBlockSchema, SITE_BINDING types

### Secondary (MEDIUM confidence)
- `packages/mesh-plugin-site-builder/` -- Empty directory, confirms no existing site builder to conflict with
- `apps/mesh/src/api/routes/dev-assets-mcp.ts` -- Dev-only MCP server implementing OBJECT_STORAGE_BINDING on local FS (reference pattern for local-fs MCP)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Zero new dependencies, all libraries already in Mesh monorepo
- Architecture: HIGH -- Following exact patterns from 3+ existing plugins with verified source code
- Pitfalls: HIGH -- Identified from actual code inspection of plugin-loader, binding checker, and layout system
- Local-fs MCP connection: MEDIUM -- The pattern is clear from deconfig CLI but the exact local-fs MCP server implementation needs verification
- Tunnel integration: MEDIUM -- The `deco link` command works but URL discovery for the plugin needs design

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable domain, Mesh plugin system is mature)

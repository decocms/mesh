# Task 003: Routing Refactor

## Overview

Refactor the entire router to move all authenticated routes under the `/$org/$project` pattern. This is a critical infrastructure change that enables project-scoped navigation.

## Prerequisites

- None (can run in parallel with Tasks 001-002)
- However, the project layout will need storage from Task 001 to fully function

## Context

### The Problem

The current router has a conflict:
- Existing: `/$org/$pluginId` catches any second segment as a plugin ID
- Proposed: `/$org/$project` would conflict with this pattern

### The Solution

Move ALL authenticated routes under `/$org/$project`:
- `/$org` → redirects to `/$org/org-admin`
- `/$org/members` → `/$org/org-admin/members`
- `/$org/$pluginId` → `/$org/$project/$pluginId`

The `org-admin` project becomes the container for org-level pages.

### Current vs New Routes

| Current Route | New Route |
|--------------|-----------|
| `/$org` | `/$org/org-admin` (redirect) |
| `/$org/members` | `/$org/org-admin/members` |
| `/$org/mcps` | `/$org/org-admin/mcps` |
| `/$org/mcps/$connectionId` | `/$org/org-admin/mcps/$connectionId` |
| `/$org/mcps/$connectionId/$collectionName/$itemId` | `/$org/org-admin/mcps/$connectionId/$collectionName/$itemId` |
| `/$org/settings` | `/$org/org-admin/settings` |
| `/$org/settings/plugins` | `/$org/org-admin/settings/plugins` |
| `/$org/monitoring` | `/$org/org-admin/monitoring` |
| `/$org/store` | `/$org/org-admin/store` |
| `/$org/store/$appName` | `/$org/org-admin/store/$appName` |
| `/$org/agents` | `/$org/org-admin/agents` |
| `/$org/agents/$agentId` | `/$org/org-admin/agents/$agentId` |
| `/$org/workflows` | `/$org/org-admin/workflows` |
| `/$org/$pluginId` | `/$org/$project/$pluginId` |

## Implementation Steps

### Step 1: Create Project Layout Component

Create `apps/mesh/src/web/layouts/project-layout.tsx`:

```typescript
import { Outlet, redirect, useParams } from "@tanstack/react-router";
import { Suspense } from "react";
import { SplashScreen } from "@/web/components/splash-screen";

// Placeholder until Task 001 storage is ready
// Once storage exists, fetch project data and provide via context

export default function ProjectLayout() {
  const { org, project } = useParams({ strict: false });

  // For now, just pass through. 
  // In Task 004, this will:
  // 1. Fetch project data from storage
  // 2. Provide ProjectContext
  // 3. Handle loading states

  return (
    <Suspense fallback={<SplashScreen />}>
      <Outlet />
    </Suspense>
  );
}
```

### Step 2: Refactor Router Structure

Update `apps/mesh/src/web/index.tsx`:

```typescript
import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";
import { Providers } from "@/web/providers/providers";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
  redirect,
  type AnyRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { SplashScreen } from "@/web/components/splash-screen";
import * as z from "zod";
import type { ReactNode } from "react";

import "../../index.css";

import { sourcePlugins } from "./plugins.ts";
import type {
  AnyClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

const rootRoute = createRootRoute({
  component: () => (
    <Providers>
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
      <TanStackRouterDevtools />
    </Providers>
  ),
});

// ============================================
// PUBLIC ROUTES (unchanged)
// ============================================

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: lazyRouteComponent(() => import("./routes/login.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      next: z.string().optional(),
      client_id: z.string().optional(),
      redirect_uri: z.string().optional(),
      response_type: z.string().optional(),
      state: z.string().optional(),
      scope: z.string().optional(),
      code_challenge: z.string().optional(),
      code_challenge_method: z.string().optional(),
    }),
  ),
});

const betterAuthRoutes = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/$pathname",
  component: lazyRouteComponent(() => import("./routes/auth-catchall.tsx")),
});

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect/$sessionId",
  component: lazyRouteComponent(() => import("./routes/connect.tsx")),
});

const storeInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/$appName",
  component: lazyRouteComponent(() => import("./routes/store-invite.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      serverName: z.string().optional(),
    }),
  ),
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: lazyRouteComponent(() => import("./routes/oauth-callback.tsx")),
});

// ============================================
// SHELL LAYOUT (authenticated wrapper)
// ============================================

const shellLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: lazyRouteComponent(() => import("./layouts/shell-layout.tsx")),
});

// Home route (landing, redirects to first org)
const homeRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/home.tsx")),
});

// ============================================
// ORG REDIRECT ROUTE
// ============================================

// Redirects /$org to /$org/org-admin
const orgRedirectRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/$project",
      params: { org: params.org, project: ORG_ADMIN_PROJECT_SLUG },
    });
  },
});

// ============================================
// PROJECT LAYOUT
// ============================================

const projectLayout = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/$project",
  component: lazyRouteComponent(() => import("./layouts/project-layout.tsx")),
});

// ============================================
// PROJECT ROUTES (available in all projects)
// ============================================

// Project home - the default view when entering a project
const projectHomeRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/orgs/home/page.tsx")),
});

// Tasks placeholder (new)
const tasksRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/tasks",
  component: lazyRouteComponent(() => import("./routes/tasks.tsx")),
});

// Project settings (new - different from org settings)
const projectSettingsRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/settings",
  component: lazyRouteComponent(() => import("./routes/project-settings.tsx")),
});

// ============================================
// ORG-ADMIN EXCLUSIVE ROUTES
// ============================================

// Helper to guard org-admin routes
const orgAdminGuard = ({ params }: { params: { project: string } }) => {
  if (params.project !== ORG_ADMIN_PROJECT_SLUG) {
    throw redirect({
      to: "/$org/$project",
      params: { org: params.org, project: params.project },
    });
  }
};

// Projects list (new - org-admin only)
const projectsListRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/projects",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/projects-list.tsx")),
});

// Members
const membersRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/members",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/members.tsx")),
});

// Connections (mcps)
const connectionsRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/mcps",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/connections.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
    }),
  ),
});

// Connection detail
const connectionDetailRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/mcps/$connectionId",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(
    () => import("./routes/orgs/connection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

// Collection detail
const collectionDetailRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/mcps/$connectionId/$collectionName/$itemId",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(
    () => import("./routes/orgs/collection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      replayId: z.string().optional(),
    }),
  ),
});

// Org Settings (different from project settings)
const orgSettingsRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/org-settings",  // Changed to avoid conflict with /settings
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/settings.tsx")),
});

const orgSettingsPluginsRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/org-settings/plugins",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/plugins.tsx"),
  ),
});

// Monitoring
const monitoringRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/monitoring",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/monitoring.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.enum(["logs", "analytics"]).default("logs"),
      from: z.string().default("now-24h"),
      to: z.string().default("now"),
      connectionId: z.array(z.string()).optional().default([]),
      virtualMcpId: z.array(z.string()).optional().default([]),
      tool: z.string().default(""),
      status: z.enum(["all", "success", "errors"]).default("all"),
      search: z.string().default(""),
      page: z.number().optional(),
      streaming: z.boolean().default(true),
      propertyFilters: z.string().default(""),
    }),
  ),
});

// Store
const storeRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/store",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/store/page.tsx")),
});

const storeDetailRoute = createRoute({
  getParentRoute: () => storeRoute,
  path: "/$appName",
  component: lazyRouteComponent(
    () => import("./routes/orgs/store/mcp-server-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      registryId: z.string().optional(),
      serverName: z.string().optional(),
      itemId: z.string().optional(),
    }),
  ),
});

// Agents
const agentsRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/agents",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/agents.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
    }),
  ),
});

const agentDetailRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/agents/$agentId",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/agent-detail.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

// Workflows
const workflowsRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/workflows",
  beforeLoad: orgAdminGuard,
  component: lazyRouteComponent(() => import("./routes/orgs/workflow.tsx")),
});

// ============================================
// PLUGIN ROUTES
// ============================================

const pluginLayoutRoute = createRoute({
  getParentRoute: () => projectLayout,  // Changed from shellLayout
  path: "/$pluginId",
  component: lazyRouteComponent(
    () => import("./layouts/dynamic-plugin-layout.tsx"),
  ),
});

// Plugin setup (same as before)
export const pluginRootSidebarItems: {
  pluginId: string;
  icon: ReactNode;
  label: string;
}[] = [];

const pluginRoutes: AnyRoute[] = [];

sourcePlugins.forEach((plugin: AnyClientPlugin) => {
  if (!plugin.setup) return;

  const context: PluginSetupContext = {
    parentRoute: pluginLayoutRoute as AnyRoute,
    routing: {
      createRoute: createRoute,
      lazyRouteComponent: lazyRouteComponent,
    },
    registerRootSidebarItem: (item) =>
      pluginRootSidebarItems.push({ pluginId: plugin.id, ...item }),
    registerPluginRoutes: (routes) => {
      pluginRoutes.push(...routes);
    },
  };

  plugin.setup(context);
});

const pluginLayoutWithChildren = pluginLayoutRoute.addChildren(pluginRoutes);

// ============================================
// LEGACY REDIRECTS (for backward compatibility)
// ============================================

// These redirect old URLs to new structure
const legacyRedirects = [
  { path: "/$org/members", segment: "members" },
  { path: "/$org/mcps", segment: "mcps" },
  { path: "/$org/settings", segment: "org-settings" },
  { path: "/$org/monitoring", segment: "monitoring" },
  { path: "/$org/store", segment: "store" },
  { path: "/$org/agents", segment: "agents" },
  { path: "/$org/workflows", segment: "workflows" },
].map(({ path, segment }) =>
  createRoute({
    getParentRoute: () => shellLayout,
    path,
    beforeLoad: ({ params }) => {
      throw redirect({
        to: `/$org/$project/${segment}`,
        params: { org: params.org, project: ORG_ADMIN_PROJECT_SLUG },
      });
    },
  })
);

// ============================================
// ROUTE TREE
// ============================================

const storeRouteWithChildren = storeRoute.addChildren([storeDetailRoute]);

const projectRoutes = [
  projectHomeRoute,
  tasksRoute,
  projectSettingsRoute,
  projectsListRoute,
  membersRoute,
  connectionsRoute,
  connectionDetailRoute,
  collectionDetailRoute,
  orgSettingsRoute,
  orgSettingsPluginsRoute,
  monitoringRoute,
  storeRouteWithChildren,
  agentsRoute,
  agentDetailRoute,
  workflowsRoute,
  pluginLayoutWithChildren,
];

const projectLayoutWithChildren = projectLayout.addChildren(projectRoutes);

const shellRouteTree = shellLayout.addChildren([
  homeRoute,
  orgRedirectRoute,
  projectLayoutWithChildren,
  ...legacyRedirects,
]);

const routeTree = rootRoute.addChildren([
  shellRouteTree,
  loginRoute,
  betterAuthRoutes,
  oauthCallbackRoute,
  connectRoute,
  storeInviteRoute,
]);

const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

### Step 3: Create Placeholder Route Components

Create `apps/mesh/src/web/routes/tasks.tsx`:

```typescript
export default function TasksPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <div className="size-12">📋</div>
      <h2 className="text-lg font-medium">Tasks</h2>
      <p className="text-sm">Coming soon - manage background tasks and agent jobs</p>
    </div>
  );
}
```

Create `apps/mesh/src/web/routes/project-settings.tsx`:

```typescript
export default function ProjectSettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Project Settings</h1>
      <p className="text-muted-foreground">Project settings will be implemented in a later task.</p>
    </div>
  );
}
```

Create `apps/mesh/src/web/routes/projects-list.tsx`:

```typescript
export default function ProjectsListPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Projects</h1>
      <p className="text-muted-foreground">Projects list will be implemented in a later task.</p>
    </div>
  );
}
```

### Step 4: Update All Navigation Links

This is the most tedious part. You need to search and update all navigation in the codebase.

**Search patterns to find:**
```bash
# In apps/mesh/src/web/
rg "to=\"/\\\$org/" --type tsx
rg 'to: "/$org/' --type ts
rg "navigate.*\$org" --type tsx --type ts
```

**Update pattern:**

| Old | New |
|-----|-----|
| `to="/$org/members"` | `to="/$org/$project/members"` |
| `to="/$org/mcps"` | `to="/$org/$project/mcps"` |
| `to="/$org/settings"` | `to="/$org/$project/org-settings"` |
| `to="/$org/monitoring"` | `to="/$org/$project/monitoring"` |
| `to="/$org/store"` | `to="/$org/$project/store"` |
| `to="/$org/agents"` | `to="/$org/$project/agents"` |
| `to="/$org/workflows"` | `to="/$org/$project/workflows"` |

**Also update params:**
```typescript
// Old
params={{ org: org.slug }}

// New
params={{ org: org.slug, project: "org-admin" }}
// or use current project:
params={{ org: org.slug, project: project.slug }}
```

### Step 5: Update Sidebar Navigation

The sidebar likely has hardcoded routes. Update `apps/mesh/src/web/components/sidebar/` files to use new route patterns.

### Step 6: Update Dynamic Plugin Layout

If `apps/mesh/src/web/layouts/dynamic-plugin-layout.tsx` uses route params, update it to handle the new structure.

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/index.tsx` | Major refactor |
| `apps/mesh/src/web/layouts/project-layout.tsx` | Create |
| `apps/mesh/src/web/routes/tasks.tsx` | Create |
| `apps/mesh/src/web/routes/project-settings.tsx` | Create |
| `apps/mesh/src/web/routes/projects-list.tsx` | Create |
| `apps/mesh/src/web/layouts/dynamic-plugin-layout.tsx` | Modify |
| `apps/mesh/src/web/components/sidebar/*.tsx` | Modify (navigation) |
| All files with `<Link to="/$org/...">` | Modify |
| All files with `navigate({ to: "/$org/..." })` | Modify |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Test Route Navigation

Start the dev server:
```bash
bun run dev
```

Test these scenarios:
1. Navigate to `/$org` → should redirect to `/$org/org-admin`
2. Navigate to `/$org/org-admin/members` → should show members page
3. Navigate to `/$org/org-admin/mcps` → should show connections page
4. Navigate to `/$org/some-project/members` → should redirect to project home (guards work)
5. Legacy URLs like `/$org/members` → should redirect to `/$org/org-admin/members`

### 3. Test Plugin Routes

1. Navigate to `/$org/org-admin/$pluginId` → plugin should load
2. Plugin sub-routes should still work

### 4. Run Lint and Format

```bash
bun run fmt
bun run lint
```

No errors should be present.

### 5. Run Tests

```bash
bun test
```

All tests should pass (some may need updates for new routes).

## Success Criteria

- [ ] All routes moved under `/$org/$project` pattern
- [ ] `/$org` redirects to `/$org/org-admin`
- [ ] Org-admin exclusive routes have guards
- [ ] Legacy redirects work for backward compatibility
- [ ] All `<Link>` and `navigate()` calls updated
- [ ] Plugin routes work under new structure
- [ ] Placeholder pages created for tasks, project-settings, projects-list
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- This is a large refactor. Take care to update ALL navigation.
- Use search tools to find all instances of old route patterns.
- The project layout is minimal for now - it will be enhanced in Task 004.
- Some sidebar/UI updates may be deferred to Task 005.

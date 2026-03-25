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
import { SplashScreen } from "@/web/components/splash-screen";
import { ChunkErrorBoundary } from "@/web/components/error-boundary";
import * as z from "zod";
import type { ReactNode } from "react";

import "../../index.css";

import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { sourcePlugins } from "./plugins.ts";
import type {
  AnyClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";

const rootRoute = createRootRoute({
  component: () => (
    <ChunkErrorBoundary>
      <Providers>
        <Suspense fallback={<SplashScreen />}>
          <Outlet />
        </Suspense>
      </Providers>
    </ChunkErrorBoundary>
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
      // Regular login redirect
      next: z.string().optional(),
      // OAuth flow params (passed by Better Auth MCP plugin)
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

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: lazyRouteComponent(() => import("./routes/reset-password.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      token: z.string().optional(),
      error: z.string().optional(),
    }),
  ),
});

/**
 * Better auth catchall
 */
const betterAuthRoutes = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/$pathname",
  component: lazyRouteComponent(() => import("./routes/auth-catchall.tsx")),
});

/**
 * Store invite route - deep links to store apps without knowing the org slug
 * After login, redirects to the user's first org and first registry
 */
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

const oauthCallbackAiProviderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback/ai-provider",
  component: lazyRouteComponent(
    () => import("./routes/oauth-callback-ai-provider.tsx"),
  ),
});

// ============================================
// SHELL LAYOUT (authenticated wrapper)
// ============================================

const shellLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: lazyRouteComponent(() => import("./layouts/shell-layout.tsx")),
});

// Home route (landing, redirects to last or only org)
const homeRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/home.tsx")),
  beforeLoad: async () => {
    // Fetch org list once — used for both slug validation and single-org redirect
    const { data: orgs } = await authClient.organization.list();

    // If the list call failed, skip all redirect logic to avoid clearing a
    // valid cached slug due to a transient API failure.
    if (!orgs) return;

    // Fast path: validate cached slug against current membership before redirecting.
    // If stale (org deleted or user removed), clear it to prevent a redirect loop
    // where an invalid slug → shell fails → back to "/" → same redirect → loop.
    const lastOrgSlug = localStorage.getItem(LOCALSTORAGE_KEYS.lastOrgSlug());
    if (lastOrgSlug) {
      const slugIsValid = orgs.some((o) => o.slug === lastOrgSlug);
      if (slugIsValid) {
        throw redirect({
          to: "/$org",
          params: { org: lastOrgSlug },
        });
      }
      // Stale — remove so future visits don't loop
      localStorage.removeItem(LOCALSTORAGE_KEYS.lastOrgSlug());
    }

    // Slow path: first-time user — redirect if they only have one org
    const onlyOrg = orgs.length === 1 ? orgs[0] : undefined;
    if (onlyOrg) {
      throw redirect({
        to: "/$org",
        params: { org: onlyOrg.slug },
      });
    }
  },
});

// ============================================
// ORG LAYOUT
// ============================================

const orgLayout = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org",
  component: lazyRouteComponent(() => import("./layouts/org-layout.tsx")),
});

// ============================================
// ORG-LEVEL ROUTES (children of orgLayout)
// ============================================

// Org home - the default view when entering an org
const orgHomeRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/orgs/home/page.tsx")),
});

// Projects list
const projectsListRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/projects",
  component: lazyRouteComponent(() => import("./routes/projects-list.tsx")),
});

// ============================================
// SETTINGS LAYOUT (/$org/settings)
// ============================================

const settingsLayout = createRoute({
  getParentRoute: () => orgLayout,
  path: "/settings",
  component: lazyRouteComponent(() => import("./layouts/settings-layout.tsx")),
});

// Settings index → redirect to /general
const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/settings/general",
      params: { org: params.org },
    });
  },
  component: () => null,
});

// Account
const settingsAccountProfileRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/account/profile",
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/account-profile.tsx"),
  ),
});

const settingsAccountPreferencesRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/account/preferences",
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/account-preferences.tsx"),
  ),
});

// Operations: Connections
const connectionsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/connections",
  component: lazyRouteComponent(() => import("./routes/orgs/connections.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
      tab: z.enum(["all", "connected"]).optional(),
    }),
  ),
});

const connectionDetailRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/connections/$appSlug",
  component: lazyRouteComponent(
    () => import("./routes/orgs/connection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

const collectionDetailRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/connections/$appSlug/$collectionName/$itemId",
  component: lazyRouteComponent(
    () => import("./routes/orgs/collection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      replayId: z.string().optional(),
    }),
  ),
});

// Operations: Automations
const automationsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/automations",
  component: lazyRouteComponent(
    () => import("./views/automations/automations-list.tsx"),
  ),
});

const automationDetailRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/automations/$automationId",
  component: lazyRouteComponent(
    () => import("./views/automations/automation-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

// Operations: Monitor
const monitoringRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/monitor",
  component: lazyRouteComponent(() => import("./routes/orgs/monitoring.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.enum(["overview", "audit"]).default("overview"),
      from: z.string().default("now-30m"),
      to: z.string().default("now"),
      connectionId: z.array(z.string()).optional().default([]),
      virtualMcpId: z.array(z.string()).optional().default([]),
      tool: z.string().default(""),
      status: z.enum(["all", "success", "errors"]).default("all"),
      search: z.string().default(""),
      page: z.number().optional(),
      streaming: z.boolean().default(true),
      propertyFilters: z.string().default(""),
      hideSystem: z.boolean().default(false),
    }),
  ),
});

// Organization settings pages
const settingsGeneralRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/general",
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/general.tsx"),
  ),
});

const settingsFeaturesRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/features",
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/features.tsx"),
  ),
});

const settingsAiProvidersRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/ai-providers",
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/ai-providers.tsx"),
  ),
});

const settingsMembersRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/members",
  component: lazyRouteComponent(
    () => import("./routes/orgs/settings/members.tsx"),
  ),
});

const settingsSsoRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "/sso",
  component: lazyRouteComponent(() => import("./routes/orgs/settings/sso.tsx")),
});

// Store detail (the store list is part of the connections "All" tab)
const storeDetailRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/store/$appName",
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

// Org-level plugin route (mirrors /$org/projects/$virtualMcpId/$pluginId for org-admin)
const orgPluginRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/plugins/$pluginId",
  component: lazyRouteComponent(
    () => import("./layouts/org-plugin-layout.tsx"),
  ),
});

// Agents
const agentsRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/agents",
  component: lazyRouteComponent(() => import("./routes/orgs/agents.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
    }),
  ),
});

const agentDetailRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/agents/$agentId",
  component: lazyRouteComponent(() => import("./routes/orgs/agent-detail.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

// ============================================
// SPACES
// ============================================

// Spaces list (view all)
const spacesListRoute = createRoute({
  getParentRoute: () => orgLayout,
  path: "/spaces",
  component: lazyRouteComponent(() => import("./routes/spaces-list.tsx")),
});

// Spaces layout (/$org/spaces/$virtualMcpId)
const spacesLayout = createRoute({
  getParentRoute: () => orgLayout,
  path: "/spaces/$virtualMcpId",
  component: lazyRouteComponent(
    () => import("./layouts/virtual-mcp-layout.tsx"),
  ),
});

// Space home - empty center, sidebar chat is the interaction point
const spaceHomeRoute = createRoute({
  getParentRoute: () => spacesLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/space-home.tsx")),
});

// ============================================
// BACKWARD COMPAT: VIRTUAL MCP LAYOUT (/$org/projects/$virtualMcpId)
// ============================================

const virtualMcpLayout = createRoute({
  getParentRoute: () => orgLayout,
  path: "/projects/$virtualMcpId",
  component: lazyRouteComponent(
    () => import("./layouts/virtual-mcp-layout.tsx"),
  ),
});

// Project home - chat view (same as org home), with optional ?view=settings
const projectHomeRoute = createRoute({
  getParentRoute: () => virtualMcpLayout,
  path: "/",
  validateSearch: z.object({
    view: z.enum(["settings"]).optional(),
  }),
  component: lazyRouteComponent(() => import("./routes/orgs/home/page.tsx")),
});

// Space app view
const spaceAppViewRoute = createRoute({
  getParentRoute: () => spacesLayout,
  path: "/apps/$connectionId/$toolName",
  component: lazyRouteComponent(() => import("./routes/project-app-view.tsx")),
});

// Space workflows
const spaceWorkflowsRoute = createRoute({
  getParentRoute: () => spacesLayout,
  path: "/workflows",
  component: lazyRouteComponent(() => import("./routes/orgs/workflow.tsx")),
});

// Space automations
const spaceAutomationsRoute = createRoute({
  getParentRoute: () => spacesLayout,
  path: "/automations",
  component: lazyRouteComponent(
    () => import("./views/automations/space-automations.tsx"),
  ),
});

// Space plugin layout
const spacePluginLayoutRoute = createRoute({
  getParentRoute: () => spacesLayout,
  path: "/$pluginId",
  component: lazyRouteComponent(
    () => import("./layouts/dynamic-plugin-layout.tsx"),
  ),
});

// Pinned App View (virtual MCP scoped)
const projectAppViewRoute = createRoute({
  getParentRoute: () => virtualMcpLayout,
  path: "/apps/$connectionId/$toolName",
  component: lazyRouteComponent(() => import("./routes/project-app-view.tsx")),
});

// Workflows (virtual MCP scoped)
const workflowsRoute = createRoute({
  getParentRoute: () => virtualMcpLayout,
  path: "/workflows",
  component: lazyRouteComponent(() => import("./routes/orgs/workflow.tsx")),
});

// Automations (virtual MCP scoped)
const projectAutomationsRoute = createRoute({
  getParentRoute: () => virtualMcpLayout,
  path: "/automations",
  component: lazyRouteComponent(
    () => import("./views/automations/space-automations.tsx"),
  ),
});

// Project settings — layout for /$org/projects/$virtualMcpId/settings/*
const projectSettingsRoute = createRoute({
  getParentRoute: () => virtualMcpLayout,
  path: "/settings",
  component: lazyRouteComponent(
    () => import("./routes/orgs/project-settings/layout.tsx"),
  ),
});

// Backward-compat redirects: old sub-routes → /settings
const projectSettingsGeneralRedirect = createRoute({
  getParentRoute: () => projectSettingsRoute,
  path: "/general",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/projects/$virtualMcpId/settings",
      params: {
        org: params.org,
        virtualMcpId: (params as Record<string, string>).virtualMcpId,
      },
    });
  },
  component: () => null,
});

const projectSettingsDependenciesRedirect = createRoute({
  getParentRoute: () => projectSettingsRoute,
  path: "/dependencies",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/projects/$virtualMcpId/settings",
      params: {
        org: params.org,
        virtualMcpId: (params as Record<string, string>).virtualMcpId,
      },
    });
  },
  component: () => null,
});

const projectSettingsSidebarRedirect = createRoute({
  getParentRoute: () => projectSettingsRoute,
  path: "/sidebar",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/projects/$virtualMcpId/settings",
      params: {
        org: params.org,
        virtualMcpId: (params as Record<string, string>).virtualMcpId,
      },
    });
  },
  component: () => null,
});

const projectSettingsPluginsRedirect = createRoute({
  getParentRoute: () => projectSettingsRoute,
  path: "/plugins",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/projects/$virtualMcpId/settings",
      params: {
        org: params.org,
        virtualMcpId: (params as Record<string, string>).virtualMcpId,
      },
    });
  },
  component: () => null,
});

const projectSettingsDangerRedirect = createRoute({
  getParentRoute: () => projectSettingsRoute,
  path: "/danger",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/projects/$virtualMcpId/settings",
      params: {
        org: params.org,
        virtualMcpId: (params as Record<string, string>).virtualMcpId,
      },
    });
  },
  component: () => null,
});

// ============================================
// PLUGIN ROUTES
// ============================================

const pluginLayoutRoute = createRoute({
  getParentRoute: () => virtualMcpLayout,
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

export const pluginSidebarGroups: {
  pluginId: string;
  id: string;
  label: string;
  items: { icon: ReactNode; label: string }[];
  defaultExpanded?: boolean;
}[] = [];

const pluginRoutes: AnyRoute[] = [];

sourcePlugins.forEach((plugin: AnyClientPlugin) => {
  // Only invoke setup if the plugin provides it
  if (!plugin.setup) return;

  const context: PluginSetupContext = {
    parentRoute: pluginLayoutRoute as AnyRoute,
    routing: {
      createRoute: createRoute,
      lazyRouteComponent: lazyRouteComponent,
    },
    registerRootSidebarItem: (item) =>
      pluginRootSidebarItems.push({ pluginId: plugin.id, ...item }),
    registerSidebarGroup: (group) =>
      pluginSidebarGroups.push({ pluginId: plugin.id, ...group }),
    registerPluginRoutes: (routes) => {
      pluginRoutes.push(...routes);
    },
  };

  plugin.setup(context);
});

// Add all plugin routes as children of the plugin layout
const pluginLayoutWithChildren = pluginLayoutRoute.addChildren(pluginRoutes);

// ============================================
// ROUTE TREE
// ============================================

const settingsWithChildren = settingsLayout.addChildren([
  settingsIndexRoute,
  settingsAccountProfileRoute,
  settingsAccountPreferencesRoute,
  connectionsRoute,
  connectionDetailRoute,
  collectionDetailRoute,
  automationsRoute,
  automationDetailRoute,
  monitoringRoute,
  settingsGeneralRoute,
  settingsFeaturesRoute,
  settingsAiProvidersRoute,
  settingsMembersRoute,
  settingsSsoRoute,
]);

const spacesWithChildren = spacesLayout.addChildren([
  spaceHomeRoute,
  spaceAppViewRoute,
  spaceWorkflowsRoute,
  spaceAutomationsRoute,
  spacePluginLayoutRoute,
]);

const projectSettingsWithChildren = projectSettingsRoute.addChildren([
  projectSettingsGeneralRedirect,
  projectSettingsDependenciesRedirect,
  projectSettingsSidebarRedirect,
  projectSettingsPluginsRedirect,
  projectSettingsDangerRedirect,
]);

const virtualMcpWithChildren = virtualMcpLayout.addChildren([
  projectHomeRoute,
  projectSettingsWithChildren,
  projectAppViewRoute,
  workflowsRoute,
  projectAutomationsRoute,
  pluginLayoutWithChildren,
]);

const orgRoutes = [
  orgHomeRoute,
  spacesListRoute,
  spacesWithChildren,
  projectsListRoute,
  settingsWithChildren,
  storeDetailRoute,
  orgPluginRoute,
  agentsRoute,
  agentDetailRoute,
  virtualMcpWithChildren,
];

const orgLayoutWithChildren = orgLayout.addChildren(orgRoutes);

const shellRouteTree = shellLayout.addChildren([
  homeRoute,
  orgLayoutWithChildren,
]);

const routeTree = rootRoute.addChildren([
  shellRouteTree,
  loginRoute,
  resetPasswordRoute,
  betterAuthRoutes,
  oauthCallbackRoute,
  oauthCallbackAiProviderRoute,
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

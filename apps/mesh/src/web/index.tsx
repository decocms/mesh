import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";
import { Providers } from "@/web/providers/providers";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  Route,
  RouterProvider,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { SplashScreen } from "@/web/components/splash-screen";
import * as z from "zod";

import "../../index.css";

import { sourcePlugins } from "./plugins.ts";
import { AnyPlugin, PluginSetupContext } from "@decocms/bindings/plugins";

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

/**
 * Better auth catchall
 */
const betterAuthRoutes = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/$pathname",
  component: lazyRouteComponent(() => import("./routes/auth-catchall.tsx")),
});

const shellLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: lazyRouteComponent(() => import("./layouts/shell-layout.tsx")),
});

const homeRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/home.tsx")),
});

const orgHomeRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org",
  component: lazyRouteComponent(() => import("./routes/orgs/home/page.tsx")),
});

const orgMembersRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/members",
  component: lazyRouteComponent(() => import("./routes/orgs/members.tsx")),
});

const orgConnectionsRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/mcps",
  component: lazyRouteComponent(() => import("./routes/orgs/connections.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
    }),
  ),
});

const orgSettingsRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/settings",
  component: lazyRouteComponent(() => import("./routes/orgs/settings.tsx")),
});

const orgMonitoringRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/monitoring",
  component: lazyRouteComponent(() => import("./routes/orgs/monitoring.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.enum(["logs", "analytics"]).default("logs"),
      from: z.string().default("now-24h"),
      to: z.string().default("now"),
      connectionId: z.array(z.string()).optional().default([]),
      gatewayId: z.array(z.string()).optional().default([]),
      tool: z.string().default(""),
      status: z.enum(["all", "success", "errors"]).default("all"),
      search: z.string().default(""),
      page: z.number().optional(),
      streaming: z.boolean().default(true),
      propertyFilters: z.string().default(""),
    }),
  ),
});

const orgStoreRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/store",
  component: lazyRouteComponent(() => import("./routes/orgs/store/page.tsx")),
});

const storeServerDetailRoute = createRoute({
  getParentRoute: () => orgStoreRoute,
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

const connectionLayoutRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/mcps/$connectionId",
  component: lazyRouteComponent(
    () => import("./routes/orgs/connection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

const collectionDetailsRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/mcps/$connectionId/$collectionName/$itemId",
  component: lazyRouteComponent(
    () => import("./routes/orgs/collection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      replayId: z.string().optional(), // Random ID to lookup input in sessionStorage
    }),
  ),
});

const orgGatewaysRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/gateways",
  component: lazyRouteComponent(() => import("./routes/orgs/gateways.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
    }),
  ),
});

const gatewayDetailRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/gateways/$gatewayId",
  component: lazyRouteComponent(
    () => import("./routes/orgs/gateway-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

const orgWorkflowRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/workflows",
  component: lazyRouteComponent(() => import("./routes/orgs/workflow.tsx")),
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: lazyRouteComponent(() => import("./routes/oauth-callback.tsx")),
});

const pluginLayoutRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/$pluginId",
  component: Outlet,
});

/**
 * In-memory state for plugins to register stuff via callbacks.
 */
export const pluginRootSidebarItems: {
  pluginId: string;
  icon: React.ReactNode;
  label: string;
}[] = [];
const pluginLayoutRoutes: Route[] = [];

export const plugins = sourcePlugins.forEach((plugin: AnyPlugin) => {
  const context: PluginSetupContext = {
    parentRoute: pluginLayoutRoute as unknown as Route,
    routing: {
      createRoute: createRoute,
      lazyRouteComponent: lazyRouteComponent,
    },
    registerRootSidebarItem: (item) => pluginRootSidebarItems.push({ pluginId: plugin.id, ...item }),
    registerRootPluginRoute: (route) => pluginLayoutRoutes.push(route),
  };

  plugin.setup(context);
});

const pluginLayoutWithChildren = pluginLayoutRoute.addChildren(pluginLayoutRoutes);

const shellRouteTree = shellLayout.addChildren([
  homeRoute,
  orgHomeRoute,
  orgMembersRoute,
  orgConnectionsRoute,
  orgGatewaysRoute,
  gatewayDetailRoute,
  orgMonitoringRoute,
  orgStoreRouteWithChildren,
  orgSettingsRoute,
  orgWorkflowRoute,
  connectionLayoutRoute,
  collectionDetailsRoute,
  pluginLayoutWithChildren,
]);

const routeTree = rootRoute.addChildren([
  shellRouteTree,
  loginRoute,
  betterAuthRoutes,
  oauthCallbackRoute,
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

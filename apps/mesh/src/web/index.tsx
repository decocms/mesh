import { createRoot } from "react-dom/client";
import { StrictMode, Suspense } from "react";
import { Providers } from "@/web/providers/providers";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
  RouterProvider,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { SplashScreen } from "@/web/components/splash-screen";
import * as z from "zod";

import "../../index.css";

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
      from: z.string().default("now-24h"),
      to: z.string().default("now"),
      connectionId: z.array(z.string()).optional().default([]),
      gatewayId: z.array(z.string()).optional().default([]),
      tool: z.string().default(""),
      status: z.enum(["all", "success", "errors"]).default("all"),
      search: z.string().default(""),
      page: z.number().optional(),
      streaming: z.boolean().default(true),
    }),
  ),
});

const orgStoreRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/store",
  component: lazyRouteComponent(() => import("./routes/orgs/store.tsx")),
});

const storeAppDetailRoute = createRoute({
  getParentRoute: () => orgStoreRoute,
  path: "/$appName",
  component: lazyRouteComponent(
    () => import("./routes/orgs/store-app-detail.tsx"),
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

// Toolboxes list page (renamed from gateways)
const orgToolboxesRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/toolbox",
  component: lazyRouteComponent(() => import("./routes/orgs/gateways.tsx")),
  validateSearch: z.lazy(() =>
    z.object({
      action: z.enum(["create"]).optional(),
    }),
  ),
});

// Legacy gateway routes - redirect to toolbox
const legacyGatewaysRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/gateways",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/toolbox",
      params: { org: params.org },
    });
  },
});

const legacyGatewayDetailRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/gateways/$gatewayId",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$org/toolbox/$toolboxId",
      params: { org: params.org, toolboxId: params.gatewayId },
    });
  },
});

// Toolbox focus mode layout
const toolboxLayout = createRoute({
  getParentRoute: () => shellLayout,
  path: "/$org/toolbox/$toolboxId",
  component: lazyRouteComponent(() => import("./layouts/toolbox-layout.tsx")),
});

// Toolbox sub-routes
const toolboxHomeRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/toolbox/home.tsx")),
});

const toolboxConnectionsRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/connections",
  component: lazyRouteComponent(
    () => import("./routes/toolbox/connections.tsx"),
  ),
});

const toolboxSettingsRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/settings",
  component: lazyRouteComponent(() => import("./routes/toolbox/settings.tsx")),
});

const toolboxMonitoringRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/monitoring",
  component: lazyRouteComponent(
    () => import("./routes/toolbox/monitoring.tsx"),
  ),
});

// Toolbox-scoped connection detail route
const toolboxConnectionLayoutRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/mcps/$connectionId",
  component: lazyRouteComponent(
    () => import("./routes/orgs/connection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      tab: z.string().optional(),
    }),
  ),
});

// Toolbox-scoped collection detail route
const toolboxCollectionDetailsRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/mcps/$connectionId/$collectionName/$itemId",
  component: lazyRouteComponent(
    () => import("./routes/orgs/collection-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      replayId: z.string().optional(),
    }),
  ),
});

// Toolbox-scoped store detail route
const toolboxStoreRoute = createRoute({
  getParentRoute: () => toolboxLayout,
  path: "/store",
  component: lazyRouteComponent(() => import("./routes/toolbox/store.tsx")),
});

const toolboxStoreAppDetailRoute = createRoute({
  getParentRoute: () => toolboxStoreRoute,
  path: "/$appName",
  component: lazyRouteComponent(
    () => import("./routes/orgs/store-app-detail.tsx"),
  ),
  validateSearch: z.lazy(() =>
    z.object({
      registryId: z.string().optional(),
      serverName: z.string().optional(),
      itemId: z.string().optional(),
    }),
  ),
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: lazyRouteComponent(() => import("./routes/oauth-callback.tsx")),
});

const orgStoreRouteWithChildren = orgStoreRoute.addChildren([
  storeAppDetailRoute,
]);

const toolboxStoreRouteWithChildren = toolboxStoreRoute.addChildren([
  toolboxStoreAppDetailRoute,
]);

// Toolbox layout with its sub-routes
const toolboxLayoutWithChildren = toolboxLayout.addChildren([
  toolboxHomeRoute,
  toolboxConnectionsRoute,
  toolboxSettingsRoute,
  toolboxMonitoringRoute,
  toolboxConnectionLayoutRoute,
  toolboxCollectionDetailsRoute,
  toolboxStoreRouteWithChildren,
]);

const shellRouteTree = shellLayout.addChildren([
  homeRoute,
  orgHomeRoute,
  orgMembersRoute,
  orgConnectionsRoute,
  orgToolboxesRoute,
  toolboxLayoutWithChildren,
  legacyGatewaysRoute,
  legacyGatewayDetailRoute,
  orgMonitoringRoute,
  orgStoreRouteWithChildren,
  orgSettingsRoute,
  connectionLayoutRoute,
  collectionDetailsRoute,
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

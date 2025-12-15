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
      next: z.string().optional(),
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
  component: lazyRouteComponent(() => import("./routes/orgs/home.tsx")),
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
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: lazyRouteComponent(() => import("./routes/oauth-callback.tsx")),
});

const orgStoreRouteWithChildren = orgStoreRoute.addChildren([
  storeAppDetailRoute,
]);

const shellRouteTree = shellLayout.addChildren([
  homeRoute,
  orgHomeRoute,
  orgMembersRoute,
  orgConnectionsRoute,
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

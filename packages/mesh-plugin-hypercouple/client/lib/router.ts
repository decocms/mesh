/**
 * Hypercouple Plugin Router
 *
 * Provides typed routing for the hypercouple plugin.
 * Uses createPluginRouter to get typed hooks.
 *
 * Routes are wrapped in a pathless layout route (id-only) to avoid
 * colliding with other plugins that also register path: "/" under
 * the shared pluginLayoutRoute parent.
 */

import { createPluginRouter } from "@decocms/bindings/plugins";
import { Outlet } from "@tanstack/react-router";

/**
 * Plugin router with typed hooks for navigation and search params.
 */
export const hypercoupleRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  // Pathless layout route to avoid "/" collision with other plugins
  const layoutRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    id: "hypercouple-layout",
    component: Outlet,
  });

  const homeRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/",
    component: lazyRouteComponent(
      () => import("../components/getting-started"),
    ),
  });

  const inviteRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/invite",
    component: lazyRouteComponent(() => import("../components/partner-invite")),
  });

  return [layoutRoute.addChildren([homeRoute, inviteRoute])];
});

/**
 * Site Editor Plugin Router
 *
 * Provides typed routing utilities for the site editor plugin.
 * Uses createPluginRouter to get typed useSearch, useNavigate, etc.
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
export const siteEditorRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  // Pathless layout route — uses id instead of path to avoid
  // duplicate "/" collision with other plugins (e.g. object-storage).
  const layoutRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    id: "site-editor-layout",
    component: Outlet,
  });

  const pagesRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/pages-list")),
  });

  const pageEditorRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/pages/$pageId",
    component: lazyRouteComponent(() => import("../components/page-editor")),
  });

  const sectionsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/sections",
    component: lazyRouteComponent(() => import("../components/sections-list")),
  });

  const blockDetailRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/sections/$blockId",
    component: lazyRouteComponent(() => import("../components/block-detail")),
  });

  const loadersRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/loaders",
    component: lazyRouteComponent(() => import("../components/loaders-list")),
  });

  const loaderDetailRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/loaders/$loaderId",
    component: lazyRouteComponent(() => import("../components/loader-detail")),
  });

  // Return the layout route with all children nested under it.
  // Only the layout gets added to pluginRoutes — no "/" collision.
  return [
    layoutRoute.addChildren([
      pagesRoute,
      pageEditorRoute,
      sectionsRoute,
      blockDetailRoute,
      loadersRoute,
      loaderDetailRoute,
    ]),
  ];
});

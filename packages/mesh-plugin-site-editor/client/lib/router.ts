/**
 * Site Editor Plugin Router
 *
 * Provides typed routing utilities for the site editor plugin.
 * Uses createPluginRouter to get typed useSearch, useNavigate, etc.
 */

import { createPluginRouter } from "@decocms/bindings/plugins";

/**
 * Plugin router with typed hooks for navigation and search params.
 */
export const siteEditorRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const pagesRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/pages-list")),
  });

  const pageEditorRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/pages/$pageId",
    component: lazyRouteComponent(() => import("../components/page-editor")),
  });

  const sectionsRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/sections",
    component: lazyRouteComponent(() => import("../components/sections-list")),
  });

  const blockDetailRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/sections/$blockId",
    component: lazyRouteComponent(() => import("../components/block-detail")),
  });

  const loadersRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/loaders",
    component: lazyRouteComponent(() => import("../components/loaders-list")),
  });

  return [
    pagesRoute,
    pageEditorRoute,
    sectionsRoute,
    blockDetailRoute,
    loadersRoute,
  ];
});

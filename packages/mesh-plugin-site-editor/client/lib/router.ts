/**
 * Site Editor Plugin Router
 *
 * Provides typed routing for the site editor plugin.
 * Two routes: pages list (/) and page composer (/pages/$pageId).
 */

import { createPluginRouter } from "@decocms/bindings/plugins";

export const siteEditorRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  // Pages list route — plugin root
  const pagesListRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/pages-list")),
  });

  // Page composer route
  const pageComposerRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/pages/$pageId",
    component: lazyRouteComponent(() => import("../components/page-composer")),
  });

  return [pagesListRoute, pageComposerRoute];
});

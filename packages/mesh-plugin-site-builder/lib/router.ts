/**
 * Site Builder Plugin Router
 *
 * Provides typed routing for the site builder plugin.
 * Routes:
 * - / : Site list (shows filtered connections)
 * - /$connectionId : Site detail with preview
 */

import { createPluginRouter } from "@decocms/bindings/plugins";
import * as z from "zod";

/**
 * Search schema for site detail route.
 */
const siteDetailSearchSchema = z.object({
  page: z.string().optional().describe("Current page route being previewed"),
});

export type SiteDetailSearch = z.infer<typeof siteDetailSearchSchema>;

/**
 * Plugin router with typed hooks for navigation.
 */
export const siteBuilderRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const indexRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/site-list")),
  });

  const detailRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/$connectionId",
    component: lazyRouteComponent(() => import("../components/site-detail")),
    validateSearch: siteDetailSearchSchema,
  });

  return [indexRoute, detailRoute];
});

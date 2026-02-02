/**
 * Site Builder Plugin Router
 *
 * Provides typed routing for the site builder plugin.
 * Uses search params for page selection (similar to object-storage's path param).
 */

import { createPluginRouter } from "@decocms/bindings/plugins";
import * as z from "zod";

/**
 * Search schema for the site builder route.
 * Uses search params to track selected page and view mode.
 */
const siteBuilderSearchSchema = z.object({
  page: z.string().optional().describe("Selected page ID to preview"),
  view: z.enum(["list", "preview"]).optional().default("list"),
});

export type SiteBuilderSearch = z.infer<typeof siteBuilderSearchSchema>;

/**
 * Plugin router with typed hooks for navigation and search params.
 */
export const siteBuilderRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const indexRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/site-list")),
    validateSearch: siteBuilderSearchSchema,
  });

  return [indexRoute];
});

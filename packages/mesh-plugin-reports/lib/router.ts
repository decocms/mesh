/**
 * Reports Plugin Router
 *
 * Provides typed routing utilities for the reports plugin.
 * The `reportId` search param makes individual report URLs copyable.
 */

import { createPluginRouter } from "@decocms/bindings/plugins";
import * as z from "zod";

/**
 * Search schema for the reports route.
 * When reportId is set, the detail view is shown.
 */
const reportsSearchSchema = z.object({
  reportId: z.string().optional(),
});

export type ReportsSearch = z.infer<typeof reportsSearchSchema>;

/**
 * Plugin router with typed hooks for navigation and search params.
 */
export const reportsRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const indexRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: lazyRouteComponent(
      () => import("../components/reports-content"),
    ),
    validateSearch: reportsSearchSchema,
  });

  return [indexRoute];
});

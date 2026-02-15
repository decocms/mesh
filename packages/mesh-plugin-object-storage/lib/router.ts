/**
 * Object Storage Plugin Router
 *
 * Provides typed routing utilities for the object storage plugin.
 * Uses createPluginRouter to get typed useSearch, useNavigate, etc.
 */

import { createPluginRouter } from "@decocms/bindings/plugins";
import { Outlet } from "@tanstack/react-router";
import * as z from "zod";

/**
 * Search schema for the file browser route.
 * Persists the current folder path, view mode, and display options in the URL.
 */
const fileBrowserSearchSchema = z.object({
  path: z.string().optional().default(""),
  flat: z.boolean().optional().default(false),
  view: z.enum(["table", "grid"]).optional().default("grid"),
});

export type FileBrowserSearch = z.infer<typeof fileBrowserSearchSchema>;

/**
 * Plugin router with typed hooks for navigation and search params.
 */
export const objectStorageRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  // Pathless layout route — uses id instead of path to avoid
  // duplicate "/" collision with other plugins (e.g. site-editor).
  const layoutRoute = createRoute({
    getParentRoute: () => ctx.parentRoute,
    id: "object-storage-layout",
    component: Outlet,
  });

  const indexRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/",
    component: lazyRouteComponent(() => import("../components/file-browser")),
    validateSearch: fileBrowserSearchSchema,
  });

  return [layoutRoute.addChildren([indexRoute])];
});

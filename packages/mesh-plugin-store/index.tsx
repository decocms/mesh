import * as z from "zod";
import type { Plugin } from "@decocms/bindings/plugins";
import { createPluginRouter } from "@decocms/bindings/plugins";
import { REGISTRY_APP_BINDING } from "@decocms/bindings";
import { Building02 } from "@untitledui/icons";
import type { Route } from "@tanstack/react-router";
import { lazy } from "react";

export const storeRouter = createPluginRouter((ctx) => {
  const indexRoute = ctx.routing.createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/",
    component: ctx.routing.lazyRouteComponent(
      () => import("./routes/page.tsx"),
    ),
  });

  const detailRoute = ctx.routing.createRoute({
    getParentRoute: () => ctx.parentRoute,
    path: "/$appName",
    component: ctx.routing.lazyRouteComponent(
      () => import("./routes/mcp-server-detail.tsx"),
    ),
    validateSearch: z.object({
      registryId: z.string().optional(),
      serverName: z.string().optional(),
      itemId: z.string().optional(),
    }),
  });

  // Return array of sibling routes
  return [indexRoute, detailRoute];
});

/**
 * Store plugin definition.
 *
 * Requires REGISTRY_APP_BINDING - connections must implement
 * COLLECTION_REGISTRY_APP_LIST and COLLECTION_REGISTRY_APP_GET tools.
 */
export const storePlugin: Plugin<typeof REGISTRY_APP_BINDING> = {
  id: "store",
  binding: REGISTRY_APP_BINDING,
  LayoutComponent: lazy(() => import("./layout")),
  setup: (ctx) => {
    const routes = storeRouter.createRoutes(ctx);

    ctx.registerRootSidebarItem({
      icon: <Building02 />,
      label: "Store",
    });

    ctx.registerPluginRoutes(routes as unknown as Route[]);
  },
};

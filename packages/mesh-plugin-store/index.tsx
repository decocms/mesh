import * as z from "zod";
import type { AnyPlugin } from "@decocms/bindings/plugins";
import { createPluginRouter } from "@decocms/bindings/plugins";
import { Building02 } from "@untitledui/icons";
import type { Route } from "@tanstack/react-router";

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
 */
export const storePlugin: AnyPlugin = {
  id: "store",
  binding: [],
  setup: (ctx) => {
    const routes = storeRouter.createRoutes(ctx);

    ctx.registerRootSidebarItem({
      icon: <Building02 />,
      label: "Store",
    });

    ctx.registerPluginRoutes(routes as unknown as Route[]);
  },
};

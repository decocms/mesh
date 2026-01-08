import * as z from "zod";
import type { AnyPlugin, Plugin } from "@decocms/bindings/plugins";
import { Building02 } from "@untitledui/icons";
import { Route } from "@tanstack/react-router";

export const storePlugin: AnyPlugin = {
  id: "store",
  binding: [],
  setup: (ctx) => {
    const orgStoreRoute = ctx.routing.createRoute({
      getParentRoute: () => ctx.parentRoute,
      path: "/",
      component: ctx.routing.lazyRouteComponent(() => import("./routes/page.tsx")),
    });

    const storeServerDetailRoute = ctx.routing.createRoute({
      getParentRoute: () => orgStoreRoute,
      path: "/$appName",
      component: ctx.routing.lazyRouteComponent(
        () => import("./routes/mcp-server-detail.tsx"),
      ),
      validateSearch: z.lazy(() =>
        z.object({
          registryId: z.string().optional(),
          serverName: z.string().optional(),
          itemId: z.string().optional(),
        }),
      ),
    });

    const orgStoreRouteWithChildren = orgStoreRoute.addChildren([
      storeServerDetailRoute,
    ]);

    ctx.registerRootSidebarItem({
      icon: <Building02 />,
      label: "Store",
    });

    ctx.registerRootPluginRoute(orgStoreRouteWithChildren as unknown as Route);
  },
};

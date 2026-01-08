import * as z from "zod";
import { createRoute, lazyRouteComponent, Route } from "@tanstack/react-router";
import type { Plugin } from "@decocms/bindings/plugins";
import { Building02 } from "@untitledui/icons";

export const storePlugin: Plugin = {
  id: "store",
  label: "Store",
  icon: <Building02 />,
  setupRoutes: (parentRoute) => {
    const orgStoreRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: "/",
      component: lazyRouteComponent(() => import("./routes/page.tsx")),
    });

    const storeServerDetailRoute = createRoute({
      getParentRoute: () => orgStoreRoute,
      path: "/$appName",
      component: lazyRouteComponent(
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

    return orgStoreRouteWithChildren as unknown as Route;
  },
};

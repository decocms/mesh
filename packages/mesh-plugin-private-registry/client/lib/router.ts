import { createPluginRouter } from "@decocms/bindings/plugins";

export const privateRegistryRouter = createPluginRouter((ctx) => {
  const { createRoute, lazyRouteComponent } = ctx.routing;

  const pluginRootRoute = createRoute({
    id: "private-registry-index",
    getParentRoute: () => ctx.parentRoute,
    component: lazyRouteComponent(
      () => import("../components/registry-layout"),
    ),
  });

  const itemsRoute = createRoute({
    getParentRoute: () => pluginRootRoute,
    path: "/",
    component: lazyRouteComponent(
      () => import("../components/registry-items-page"),
    ),
  });

  const detailsRoute = createRoute({
    getParentRoute: () => pluginRootRoute,
    path: "/$itemId",
    component: lazyRouteComponent(
      () => import("../components/registry-items-page"),
    ),
  });

  // Settings is rendered as a tab within the layout, not a separate route.
  return [pluginRootRoute.addChildren([itemsRoute, detailsRoute])];
});

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

  const settingsRoute = createRoute({
    getParentRoute: () => pluginRootRoute,
    path: "/settings",
    component: lazyRouteComponent(
      () => import("../components/registry-settings-page"),
    ),
  });

  const testRoute = createRoute({
    getParentRoute: () => pluginRootRoute,
    path: "/test",
    component: lazyRouteComponent(
      () => import("../components/registry-test-page"),
    ),
  });

  const detailsRoute = createRoute({
    getParentRoute: () => pluginRootRoute,
    path: "/$itemId",
    component: lazyRouteComponent(
      () => import("../components/registry-items-page"),
    ),
  });

  return [
    pluginRootRoute.addChildren([
      itemsRoute,
      settingsRoute,
      testRoute,
      detailsRoute,
    ]),
  ];
});

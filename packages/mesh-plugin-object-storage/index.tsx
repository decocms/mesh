/**
 * Object Storage Plugin
 *
 * Provides a file browser UI for S3-compatible object storage connections.
 * Uses the OBJECT_STORAGE_BINDING to filter compatible connections.
 */

import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import type { Plugin, PluginSetupContext } from "@decocms/bindings/plugins";
import { Folder } from "@untitledui/icons";
import { lazy } from "react";

// Lazy load the layout component
const ObjectStorageLayout = lazy(() => import("./layout"));

/**
 * Object Storage Plugin Definition
 */
export const objectStoragePlugin: Plugin<typeof OBJECT_STORAGE_BINDING> = {
  id: "object-storage",
  binding: OBJECT_STORAGE_BINDING,
  LayoutComponent: ObjectStorageLayout,
  setup: (context: PluginSetupContext) => {
    const {
      parentRoute,
      routing,
      registerRootSidebarItem,
      registerPluginRoutes,
    } = context;
    const { createRoute, lazyRouteComponent } = routing;

    // Register sidebar item
    registerRootSidebarItem({
      icon: <Folder size={20} />,
      label: "Files",
    });

    // Create plugin routes
    const indexRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: "/",
      component: lazyRouteComponent(() => import("./components/file-browser")),
    });

    registerPluginRoutes([indexRoute]);
  },
};

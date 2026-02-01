/**
 * Site Builder Plugin
 *
 * Provides AI-assisted site building with live preview.
 * Filters connections to show only local-fs MCPs with deno.json containing deco imports.
 */

import { lazy } from "react";
import { Globe01 } from "@untitledui/icons";
import type { Plugin, PluginSetupContext } from "@decocms/bindings/plugins";
import { SITE_BUILDER_BINDING } from "./lib/binding";
import { siteBuilderRouter } from "./lib/router";

// Lazy load components
const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

/**
 * Site Builder Plugin Definition
 */
export const siteBuilderPlugin: Plugin<typeof SITE_BUILDER_BINDING> = {
  id: "site-builder",
  description: "AI-assisted site building with live preview",
  binding: SITE_BUILDER_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    const { registerRootSidebarItem, registerPluginRoutes } = context;

    // Register sidebar item with Globe icon
    registerRootSidebarItem({
      icon: <Globe01 size={20} />,
      label: "Sites",
    });

    // Create and register plugin routes
    const routes = siteBuilderRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};

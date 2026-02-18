/**
 * Site Editor Plugin - Client Entry Point
 *
 * Provides the CMS UI for managing site pages, sections, and loaders.
 * Uses the SITE_BINDING to filter compatible connections.
 */

import { SITE_BINDING } from "@decocms/bindings/site";
import type { Plugin, PluginSetupContext } from "@decocms/bindings/plugins";
import { File06, LayoutAlt03, Database01 } from "@untitledui/icons";
import { lazy } from "react";
import { siteEditorRouter } from "./lib/router";
import { useSiteStore } from "./lib/site-store";

// Lazy load the header/empty state components that use UI dependencies
const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

/**
 * Site Editor Plugin Definition
 */
export const clientPlugin: Plugin<typeof SITE_BINDING> = {
  id: "site-editor",
  description: "CMS for managing site pages, sections, and loaders",
  binding: SITE_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  useConnectionId: () => useSiteStore().activeSiteId,
  setup: (context: PluginSetupContext) => {
    const { registerSidebarGroup, registerPluginRoutes } = context;

    // Register sidebar group with CMS items
    registerSidebarGroup({
      id: "site-editor",
      label: "CMS",
      items: [
        {
          icon: <File06 size={16} />,
          label: "Pages",
          path: "/",
        },
        {
          icon: <LayoutAlt03 size={16} />,
          label: "Sections",
          path: "/sections",
        },
        {
          icon: <Database01 size={16} />,
          label: "Loaders",
          path: "/loaders",
        },
      ],
      defaultExpanded: true,
    });

    // Create and register plugin routes using the typed router
    const routes = siteEditorRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};

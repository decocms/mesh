/**
 * Hypercouple Plugin - Client Entry Point
 *
 * Provides the couple's workspace UI inside mesh admin.
 * Uses no specific binding (binding: []) since Hypercouple
 * is a standalone workspace, not tied to an external connection.
 */

import type { Binder } from "@decocms/bindings";
import type {
  ClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";
import { Home, Users } from "lucide-react";
import { lazy } from "react";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";
import { hypercoupleRouter } from "./lib/router";

// Lazy load header and empty state
const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

/**
 * Hypercouple Client Plugin Definition
 */
export const clientPlugin: ClientPlugin<Binder> = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  binding: [],
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    const { registerSidebarGroup, registerPluginRoutes } = context;

    // Register sidebar group with couple workspace items
    registerSidebarGroup({
      id: "hypercouple",
      label: "Hypercouple",
      items: [
        {
          icon: <Home size={16} />,
          label: "Home",
        },
        {
          icon: <Users size={16} />,
          label: "Our Space",
        },
      ],
      defaultExpanded: true,
    });

    // Create and register plugin routes
    const routes = hypercoupleRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};

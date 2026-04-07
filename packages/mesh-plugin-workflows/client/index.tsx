/**
 * Workflows Plugin - Client Entry Point
 *
 * Exports the ClientPlugin implementation.
 */

import type { ClientPlugin } from "@decocms/bindings/plugins";
import { lazy } from "react";
import { Dataflow03 } from "@untitledui/icons";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";

// Lazy load the header/empty state components that use UI dependencies
const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

/**
 * Workflows Client Plugin Definition
 */
export const clientPlugin: ClientPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  bindingName: "WORKFLOW",
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context) => {
    context.registerSettingsSidebarItem({
      key: "workflows",
      icon: <Dataflow03 size={14} />,
      label: "MCP Workflows",
      to: "/$org/settings/workflows",
    });
  },
};

/**
 * Reports Plugin
 *
 * Provides a UI for viewing automated reports.
 * Reports are provided by an MCP server that implements the REPORTS_BINDING.
 */

import { REPORTS_BINDING } from "@decocms/bindings";
import type {
  ClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";
import { FileCheck02 } from "@untitledui/icons";
import { lazy } from "react";
import { reportsRouter } from "./lib/router";

const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

/**
 * Reports Plugin Definition
 */
export const reportsPlugin: ClientPlugin<typeof REPORTS_BINDING> = {
  id: "reports",
  description: "View automated reports with actionable insights",
  binding: REPORTS_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    const { registerSidebarGroup, registerPluginRoutes } = context;

    // Register under the "Observability" sidebar group
    registerSidebarGroup({
      id: "observability",
      label: "Observability",
      items: [
        {
          icon: <FileCheck02 size={16} />,
          label: "Reports",
        },
      ],
    });

    // Create and register plugin routes
    const routes = reportsRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};

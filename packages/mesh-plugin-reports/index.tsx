/**
 * Reports Plugin
 *
 * Provides a UI for viewing automated reports with actionable insights.
 * Reports are provided by an MCP server that implements the REPORTS_BINDING.
 *
 * Uses LayoutComponent (instead of routes) to avoid route ID collisions
 * with other plugins that share the /$pluginId parent route.
 */

import { REPORTS_BINDING } from "@decocms/bindings";
import type {
  ClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";
import { FileCheck02 } from "@untitledui/icons";
import { lazy } from "react";

const ReportsLayout = lazy(() => import("./components/reports-layout"));

/**
 * Reports Plugin Definition
 */
export const reportsPlugin: ClientPlugin<typeof REPORTS_BINDING> = {
  id: "reports",
  description: "View automated reports with actionable insights",
  binding: REPORTS_BINDING,
  LayoutComponent: ReportsLayout,
  setup: (context: PluginSetupContext) => {
    // Register sidebar item only -- no routes (LayoutComponent handles rendering)
    context.registerRootSidebarItem({
      icon: <FileCheck02 size={16} />,
      label: "Reports",
    });
  },
};

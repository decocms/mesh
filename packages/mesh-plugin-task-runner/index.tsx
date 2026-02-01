/**
 * Task Runner Plugin
 *
 * Provides a task management UI with Beads integration and agent loops.
 * Uses OBJECT_STORAGE_BINDING to share connections with the Files plugin.
 * The workspace is derived from the storage connection's GET_ROOT tool.
 */

import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import type { Plugin, PluginSetupContext } from "@decocms/bindings/plugins";
import { File04 } from "@untitledui/icons";
import { lazy } from "react";
import { taskRunnerRouter } from "./lib/router";

// Lazy load components
const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

/**
 * Task Runner Plugin Definition
 */
export const taskRunnerPlugin: Plugin<typeof OBJECT_STORAGE_BINDING> = {
  id: "task-runner",
  description: "Orchestrate AI agents with Beads tasks and agent loops",
  binding: OBJECT_STORAGE_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    const { registerRootSidebarItem, registerPluginRoutes } = context;

    // Register sidebar item
    registerRootSidebarItem({
      icon: <File04 size={20} />,
      label: "Tasks",
    });

    // Create and register plugin routes
    const routes = taskRunnerRouter.createRoutes(context);
    registerPluginRoutes(routes);
  },
};

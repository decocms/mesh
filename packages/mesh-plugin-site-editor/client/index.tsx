/**
 * Site Editor Plugin - Client Entry Point
 *
 * ClientPlugin definition wired to DECO_BLOCKS_BINDING.
 * The plugin tab is hidden automatically for projects that don't
 * implement the binding.
 */

import { DECO_BLOCKS_BINDING } from "@decocms/bindings";
import type {
  ClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";
import { lazy } from "react";
import { LayoutAlt03 } from "@untitledui/icons";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";

const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

export const clientPlugin: ClientPlugin<typeof DECO_BLOCKS_BINDING> = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  binding: DECO_BLOCKS_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    context.registerRootSidebarItem({
      icon: <LayoutAlt03 size={16} />,
      label: "Site Editor",
    });
    // Routes will be registered here in plan 17-04 when the router exists
    context.registerPluginRoutes([]);
  },
};

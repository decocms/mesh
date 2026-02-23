/**
 * Site Editor Plugin - Client Entry Point
 *
 * ClientPlugin definition wired to DECO_BLOCKS_BINDING.
 * The plugin tab is hidden automatically for projects that don't
 * implement the binding.
 */

import type {
  ClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";
import { lazy } from "react";
import { LayoutAlt03 } from "@untitledui/icons";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";
import { SITE_EDITOR_BINDING } from "../lib/binding";
import { siteEditorRouter } from "./lib/router";

const PluginHeader = lazy(() => import("./components/plugin-header"));
const PluginEmptyState = lazy(() => import("./components/plugin-empty-state"));

export const clientPlugin: ClientPlugin<typeof SITE_EDITOR_BINDING> = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  binding: SITE_EDITOR_BINDING,
  renderHeader: (props) => <PluginHeader {...props} />,
  renderEmptyState: () => <PluginEmptyState />,
  setup: (context: PluginSetupContext) => {
    context.registerRootSidebarItem({
      icon: <LayoutAlt03 size={16} />,
      label: "Site Editor",
    });
    const routes = siteEditorRouter.createRoutes(context);
    context.registerPluginRoutes(routes);
  },
};

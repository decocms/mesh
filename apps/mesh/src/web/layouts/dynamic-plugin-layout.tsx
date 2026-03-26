/**
 * Dynamic Plugin Layout
 *
 * Routes to the appropriate plugin layout based on the $pluginId param.
 * Uses the plugin's renderHeader/renderEmptyState if defined, otherwise falls back to Outlet.
 */

import { Outlet, useParams } from "@tanstack/react-router";
import { sourcePlugins } from "../plugins";
import { PluginLayout } from "./plugin-layout";

export default function DynamicPluginLayout() {
  const { pluginId } = useParams({
    from: "/shell/$org/$virtualMcpId/$pluginId",
  });

  // Find the plugin by ID
  const plugin = sourcePlugins.find((p) => p.id === pluginId);

  // If plugin has render props and a binding name, use PluginLayout with those
  if (plugin?.renderHeader && plugin?.renderEmptyState && plugin?.bindingName) {
    return (
      <PluginLayout
        bindingName={plugin.bindingName}
        renderHeader={plugin.renderHeader}
        renderEmptyState={plugin.renderEmptyState}
      />
    );
  }

  // Fallback: legacy LayoutComponent or just Outlet
  const LayoutComponent = plugin?.LayoutComponent;
  if (!LayoutComponent) {
    return <Outlet />;
  }

  return <LayoutComponent />;
}

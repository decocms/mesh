import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { Plugin } from "@decocms/bindings/plugins";
import type { Route } from "@tanstack/react-router";
import { storePlugin } from "../../../../packages/mesh-plugin-store/index.tsx";

const plugins: Plugin[] = [storePlugin];

export function loadPluginRoutes(pluginLayout: Route): Route[] {
  return plugins.map((plugin: Plugin) => {
    return plugin.setupRoutes(pluginLayout as unknown as Route);
  }) as Route[];
}

export function loadPluginSidebarItems({
  navigate,
}: {
  navigate: (pluginId: string) => void;
}): NavigationSidebarItem[] {
  return plugins.map((plugin: Plugin) => {
    return {
      key: `plugin-${plugin.id}`,
      icon: plugin.icon,
      label: plugin.label,
      onClick: () => navigate(plugin.id),
    };
  });
}

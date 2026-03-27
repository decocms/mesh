import type { ClientPlugin } from "@decocms/bindings/plugins";
import { Package } from "@untitledui/icons";
import { lazy } from "react";
import { PLUGIN_DESCRIPTION, PLUGIN_ID } from "../shared";

const PrivateRegistryLayout = lazy(
  () => import("./components/registry-layout"),
);

export const clientPlugin: ClientPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  // No binding — this plugin runs on the self MCP, not an external connection.
  LayoutComponent: PrivateRegistryLayout,
  setup: (context) => {
    context.registerSettingsSidebarItem({
      key: "private-registry",
      icon: <Package size={14} />,
      label: "Registry",
      to: "/$org/settings/registry",
    });
  },
};

import { REGISTRY_APP_BINDING } from "@decocms/bindings";
import type { ClientPlugin } from "@decocms/bindings/plugins";
import { lazy } from "react";
import { PLUGIN_DESCRIPTION, PLUGIN_ID } from "../shared";

const PrivateRegistryLayout = lazy(
  () => import("./components/registry-layout"),
);

export const clientPlugin: ClientPlugin<typeof REGISTRY_APP_BINDING> = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  binding: REGISTRY_APP_BINDING,
  LayoutComponent: PrivateRegistryLayout,
  setup: (context) => {
    context.registerSidebarGroup({
      id: "private-registry",
      label: "Private Registry",
      items: [
        {
          icon: "PR",
          label: "Registry",
        },
      ],
      defaultExpanded: true,
    });
  },
};

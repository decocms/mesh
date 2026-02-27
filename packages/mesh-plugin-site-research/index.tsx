/**
 * Site Research Plugin
 *
 * Provides a UI for analyzing websites across SEO, performance, content quality,
 * and more. Uses a configured Virtual MCP with object storage for state
 * and research tools for analysis.
 *
 * Uses LayoutComponent to render the full research UI.
 */

import type { Binder } from "@decocms/bindings";
import type {
  ClientPlugin,
  PluginSetupContext,
} from "@decocms/bindings/plugins";
import { SearchLg } from "@untitledui/icons";
import { lazy } from "react";
import { PLUGIN_DESCRIPTION, PLUGIN_ID } from "./shared";

const ResearchLayout = lazy(() => import("./components/research-layout"));

// Empty binding so the settings page shows the connection picker,
// but doesn't filter out any connections (including Virtual MCPs).
const EMPTY_BINDING = [] as const satisfies Binder;

export const siteResearchPlugin: ClientPlugin<typeof EMPTY_BINDING> = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  binding: EMPTY_BINDING,
  LayoutComponent: ResearchLayout,
  setup: (context: PluginSetupContext) => {
    context.registerSidebarGroup({
      id: "research",
      label: "Research",
      items: [
        {
          icon: <SearchLg size={16} />,
          label: "Site Research",
        },
      ],
    });
  },
};

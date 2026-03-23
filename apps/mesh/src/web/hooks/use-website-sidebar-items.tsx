/**
 * Sidebar items for "website" workspace type.
 *
 * Shows:
 * - Home (dashboard)
 * - Plugin groups (registered by deco.cx MCP)
 * - Pinned views
 * - Tasks
 * - Settings
 */

import type {
  NavigationSidebarItem,
  SidebarSection,
} from "@/web/components/sidebar/types";
import { useNavigate } from "@tanstack/react-router";
import { CheckDone01, Dataflow03, Settings01 } from "@untitledui/icons";

interface UseWebsiteSidebarItemsOpts {
  homeItem: NavigationSidebarItem;
  org: string;
  project: string;
  isActiveRoute: (path: string) => boolean;
  enabledPlugins: string[];
  pluginGroupSections: SidebarSection[];
  pinnedViewsSection: SidebarSection | null;
}

export function useWebsiteSidebarItems({
  homeItem,
  org,
  project,
  isActiveRoute,
  enabledPlugins,
  pluginGroupSections,
  pinnedViewsSection,
}: UseWebsiteSidebarItemsOpts): SidebarSection[] {
  const navigate = useNavigate();

  const tasksItem: NavigationSidebarItem = {
    key: "tasks",
    label: "Tasks",
    icon: <CheckDone01 />,
    isActive: isActiveRoute("tasks"),
    onClick: () =>
      navigate({
        to: "/$org/$project/tasks",
        params: { org, project },
      }),
  };

  const workflowsItem: NavigationSidebarItem | null = enabledPlugins.includes(
    "workflows",
  )
    ? {
        key: "workflows",
        label: "Workflows",
        icon: <Dataflow03 />,
        isActive: isActiveRoute("workflows"),
        onClick: () =>
          navigate({
            to: "/$org/$project/workflows",
            params: { org, project },
          }),
      }
    : null;

  const settingsItem: NavigationSidebarItem = {
    key: "settings",
    label: "Settings",
    icon: <Settings01 />,
    isActive: isActiveRoute("settings"),
    onClick: () =>
      navigate({
        to: "/$org/$project/settings/general",
        params: { org, project },
      }),
  };

  const sections: SidebarSection[] = [{ type: "items", items: [homeItem] }];

  // Plugin groups (CMS, Pages, Assets, etc. from deco.cx MCP)
  if (pluginGroupSections.length > 0) {
    sections.push(...pluginGroupSections);
  }

  // Pinned views
  if (pinnedViewsSection) {
    sections.push(pinnedViewsSection);
  }

  // Bottom items
  sections.push({ type: "divider" });
  sections.push({
    type: "items",
    items: [tasksItem, ...(workflowsItem ? [workflowsItem] : []), settingsItem],
  });

  return sections;
}

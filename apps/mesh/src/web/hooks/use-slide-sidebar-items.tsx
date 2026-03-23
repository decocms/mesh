/**
 * Sidebar items for "slides" workspace type.
 *
 * Shows:
 * - Home (deck overview / template gallery)
 * - Tasks
 * - Settings
 */

import type {
  NavigationSidebarItem,
  SidebarSection,
} from "@/web/components/sidebar/types";
import { useNavigate } from "@tanstack/react-router";
import { CheckDone01, Settings01 } from "@untitledui/icons";

interface UseSlideSidebarItemsOpts {
  homeItem: NavigationSidebarItem;
  org: string;
  project: string;
  isActiveRoute: (path: string) => boolean;
}

export function useSlideSidebarItems({
  homeItem,
  org,
  project,
  isActiveRoute,
}: UseSlideSidebarItemsOpts): SidebarSection[] {
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

  return [
    { type: "items", items: [homeItem] },
    { type: "divider" },
    { type: "items", items: [tasksItem, settingsItem] },
  ];
}

import { useProjectContext } from "@decocms/mesh-sdk";
import type {
  NavigationSidebarItem,
  SidebarSection,
} from "@/web/components/sidebar/types";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Home01, LayoutLeft } from "@untitledui/icons";
import { useDecoTasksOpen } from "@/web/hooks/use-deco-tasks-open";
import { pluginRootSidebarItems, pluginSidebarGroups } from "../index.tsx";

export function useProjectSidebarItems(): SidebarSection[] {
  const { org: orgContext } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const [, setTasksOpen] = useDecoTasksOpen();
  const org = orgContext.slug;
  const currentProject = useProjectContext().project;

  // The virtual MCP ID for this project
  const virtualMcpId = currentProject.id;

  // All projects (including org-admin) use project-level enabledPlugins
  const enabledPlugins = currentProject.enabledPlugins ?? [];

  // Pinned views from project UI settings
  const pinnedViews =
    (
      currentProject.ui as
        | {
            pinnedViews?: Array<{
              connectionId: string;
              toolName: string;
              label: string;
              icon: string | null;
            }> | null;
          }
        | null
        | undefined
    )?.pinnedViews ?? [];

  // Filter plugins to only show enabled ones
  const enabledPluginItems = pluginRootSidebarItems.filter((item) =>
    enabledPlugins.includes(item.pluginId),
  );

  const pathname = routerState.location.pathname;

  const basePath = `/${org}`;

  const isActiveRoute = (path: string) =>
    pathname.startsWith(`${basePath}/${path}`);

  // Plugin items mapped to navigation items (flat items)
  // Plugins are scoped to the virtual MCP
  const pluginItems: NavigationSidebarItem[] = enabledPluginItems.map(
    (item) => ({
      key: item.pluginId,
      label: item.label,
      icon: item.icon,
      isActive: isActiveRoute(item.pluginId),
      onClick: () =>
        navigate({
          to: "/$org/projects/$virtualMcpId/$pluginId",
          params: {
            org,
            virtualMcpId,
            pluginId: item.pluginId,
          },
        }),
    }),
  );

  // Filter plugin groups to only show enabled ones
  const enabledPluginGroups = pluginSidebarGroups.filter((group) =>
    enabledPlugins.includes(group.pluginId),
  );

  // Plugin groups mapped to sidebar sections
  const pluginGroupSections: SidebarSection[] = enabledPluginGroups.map(
    (group) => ({
      type: "group" as const,
      group: {
        id: `${group.pluginId}-${group.id}`,
        label: group.label,
        items: group.items.map((item, index) => ({
          key: `${group.pluginId}-${group.id}-${index}`,
          label: item.label,
          icon: item.icon,
          isActive: isActiveRoute(group.pluginId),
          onClick: () =>
            navigate({
              to: "/$org/projects/$virtualMcpId/$pluginId",
              params: {
                org,
                virtualMcpId,
                pluginId: group.pluginId,
              },
            }),
        })),
        defaultExpanded: group.defaultExpanded ?? true,
      },
    }),
  );

  // Build pinned views sidebar items
  // Pinned views are scoped to the virtual MCP
  const pinnedViewItems: NavigationSidebarItem[] = pinnedViews.map((view) => ({
    key: `app-${view.connectionId}-${view.toolName}`,
    label: view.label || view.toolName,
    icon: view.icon ? (
      <img src={view.icon} alt="" className="size-4 rounded" />
    ) : (
      <LayoutLeft />
    ),
    isActive: isActiveRoute(
      `apps/${view.connectionId}/${encodeURIComponent(view.toolName)}`,
    ),
    onClick: () =>
      navigate({
        to: "/$org/projects/$virtualMcpId/apps/$connectionId/$toolName",
        params: {
          org,
          virtualMcpId,
          connectionId: view.connectionId,
          toolName: view.toolName,
        },
      }),
  }));

  const pinnedViewsSection: SidebarSection | null =
    pinnedViewItems.length > 0
      ? {
          type: "group",
          group: {
            id: "apps",
            label: "Apps",
            items: pinnedViewItems,
            defaultExpanded: true,
          },
        }
      : null;

  const homeItem: NavigationSidebarItem = {
    key: "home",
    label: "Home",
    icon: <Home01 className="!size-4" />,
    isActive: pathname === "/",
    onClick: () => {
      setTasksOpen(false);
      navigate({ to: "/" });
    },
  };

  const sections: SidebarSection[] = [{ type: "items", items: [homeItem] }];

  // Add flat plugin items if any
  if (pluginItems.length > 0) {
    sections.push({ type: "items", items: pluginItems });
  }

  // Add plugin groups
  if (pluginGroupSections.length > 0) {
    sections.push(...pluginGroupSections);
  }

  // Add pinned views
  if (pinnedViewsSection) {
    sections.push(pinnedViewsSection);
  }

  return sections;
}

import { useProjectContext } from "@decocms/mesh-sdk";
import type {
  NavigationSidebarItem,
  SidebarSection,
} from "@/web/components/sidebar/types";
import {
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { Dataflow03, Home01, LayoutLeft } from "@untitledui/icons";
import { getIconComponent, parseIconString } from "../components/agent-icon";
import { usePanelActions } from "@/web/layouts/shell-layout";
import { formatPinnedViewTabId } from "@/web/layouts/main-panel-tabs/tab-id";
import { pluginRootSidebarItems, pluginSidebarGroups } from "../index.tsx";
import { PLUGIN_ID as WORKFLOWS_PLUGIN_ID } from "mesh-plugin-workflows/shared";

export function useProjectSidebarItems(): SidebarSection[] {
  const { org: orgContext } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { setTasksOpen, openTab } = usePanelActions();
  const org = orgContext.slug;
  const currentProject = useProjectContext().project;

  const routeParams = useParams({ strict: false }) as {
    taskId?: string;
    pluginId?: string;
  };
  const searchParams = useSearch({ strict: false }) as {
    virtualmcpid?: string;
  };

  const pathname = routerState.location.pathname;

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

  // Detect agent context from the virtualmcpid search param.
  // Sidebar is rendered outside VirtualMCPProvider, so useProjectContext
  // always returns the org-level project.
  const virtualMcpId = searchParams.virtualmcpid ?? currentProject.id;
  const isInsideAgent = !!searchParams.virtualmcpid;
  const currentTaskId = routeParams.taskId ?? "";

  const activePluginId = routeParams.pluginId;
  const isActivePlugin = (pluginId: string) => activePluginId === pluginId;

  const navigateToPlugin = (pluginId: string) => {
    const taskId = currentTaskId || crypto.randomUUID();
    navigate({
      to: "/$org/$taskId/$pluginId",
      params: { org, taskId, pluginId },
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        virtualmcpid: virtualMcpId,
      }),
    });
  };

  // Plugin items mapped to navigation items (flat items)
  const pluginItems: NavigationSidebarItem[] = enabledPluginItems.map(
    (item) => ({
      key: item.pluginId,
      label: item.label,
      icon: item.icon,
      isActive: isActivePlugin(item.pluginId),
      onClick: () => navigateToPlugin(item.pluginId),
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
          isActive: isActivePlugin(group.pluginId),
          onClick: () => navigateToPlugin(group.pluginId),
        })),
        defaultExpanded: group.defaultExpanded ?? true,
      },
    }),
  );

  // Build pinned views sidebar items.
  // Pinned views open the app-view in the current main panel tab.
  const pinnedViewItems: NavigationSidebarItem[] = pinnedViews.map((view) => {
    const parsed = parseIconString(view.icon);
    const IconComp =
      parsed.type === "icon" ? getIconComponent(parsed.name) : null;
    return {
      key: `app-${view.connectionId}-${view.toolName}`,
      label: view.label || view.toolName,
      icon: IconComp ? (
        <IconComp size={16} className="text-muted-foreground" />
      ) : parsed.type === "url" ? (
        <img src={parsed.url} alt="" className="size-4 rounded" />
      ) : (
        <LayoutLeft size={16} className="text-muted-foreground" />
      ),
      isActive: false,
      onClick: () =>
        openTab(formatPinnedViewTabId(view.connectionId, view.toolName)),
    };
  });

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
    icon: <Home01 className="size-4!" />,
    isActive: pathname === `/${org}` || pathname === `/${org}/`,
    onClick: () => {
      setTasksOpen(false);
      navigate({ to: "/$org", params: { org } });
    },
  };

  const isWorkflowsEnabled = enabledPlugins.includes(WORKFLOWS_PLUGIN_ID);

  const workflowsItem: NavigationSidebarItem = {
    key: "workflows",
    label: "Workflows",
    icon: <Dataflow03 className="size-4!" />,
    isActive: pathname.startsWith(`/${org}/settings/workflows`),
    onClick: () =>
      navigate({
        to: "/$org/settings/workflows",
        params: { org },
      }),
  };

  const topItems: NavigationSidebarItem[] = [homeItem];
  if (isInsideAgent && isWorkflowsEnabled) {
    topItems.push(workflowsItem);
  }

  const sections: SidebarSection[] = [{ type: "items", items: topItems }];

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

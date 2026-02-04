import { Locator, ORG_ADMIN_PROJECT_SLUG } from "@decocms/mesh-sdk";
import { useProjectContext } from "@decocms/mesh-sdk";
import type {
  NavigationSidebarItem,
  SidebarSection,
} from "@/web/components/sidebar/types";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart10,
  Building02,
  CheckDone01,
  Container,
  Dataflow03,
  FaceSmile,
  Folder,
  Home02,
  Target04,
  Users03,
  ZapSquare,
} from "@untitledui/icons";
import { pluginRootSidebarItems } from "../index.tsx";
import { useOrganizationSettings } from "./collections/use-organization-settings";
import { useProject } from "./use-project";

export function useProjectSidebarItems(): SidebarSection[] {
  const { locator, org: orgContext } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { org, project } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  // Get organization settings for org-admin project
  const orgSettings = useOrganizationSettings(orgContext.id);

  // Fetch project data to get enabledPlugins (sidebar is outside ProjectLayout context)
  const { data: projectData } = useProject(orgContext.id, project);

  // Use project's enabledPlugins for regular projects, org settings for org-admin
  const enabledPlugins = isOrgAdminProject
    ? (orgSettings?.enabled_plugins ?? [])
    : (projectData?.enabledPlugins ?? []);

  // Filter plugins to only show enabled ones
  const enabledPluginItems = pluginRootSidebarItems.filter((item) =>
    enabledPlugins.includes(item.pluginId),
  );

  const isOnHome =
    routerState.location.pathname === `/${org}/${project}` ||
    routerState.location.pathname === `/${org}/${project}/`;

  // Common items for all projects
  const homeItem: NavigationSidebarItem = {
    key: "home",
    label: "Home",
    icon: <Home02 />,
    onClick: () => {
      if (isOnHome) {
        window.dispatchEvent(new CustomEvent("reset-home-view"));
      } else {
        navigate({
          to: "/$org/$project",
          params: { org, project },
        });
      }
    },
  };

  // Org-admin specific items - flat list matching Figma design
  const tasksItem: NavigationSidebarItem = {
    key: "tasks",
    label: "Tasks",
    icon: <CheckDone01 />,
    onClick: () =>
      navigate({
        to: "/$org/$project/tasks",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  const connectionsItem: NavigationSidebarItem = {
    key: "mcps",
    label: "Connections",
    icon: <Container />,
    onClick: () =>
      navigate({
        to: "/$org/$project/mcps",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  const projectsItem: NavigationSidebarItem = {
    key: "projects",
    label: "Projects",
    icon: <Folder />,
    onClick: () =>
      navigate({
        to: "/$org/$project/projects",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  const storeItem: NavigationSidebarItem = {
    key: "store",
    label: "Store",
    icon: <Building02 />,
    onClick: () =>
      navigate({
        to: "/$org/$project/store",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  const agentsItem: NavigationSidebarItem = {
    key: "agents",
    label: "Agents",
    icon: <Users03 />,
    onClick: () =>
      navigate({
        to: "/$org/$project/agents",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  const monitorItem: NavigationSidebarItem = {
    key: "monitoring",
    label: "Monitor",
    icon: <BarChart10 />,
    onClick: () =>
      navigate({
        to: "/$org/$project/monitoring",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  const membersItem: NavigationSidebarItem = {
    key: "members",
    label: "Members",
    icon: <FaceSmile />,
    onClick: () =>
      navigate({
        to: "/$org/$project/members",
        params: { org, project: ORG_ADMIN_PROJECT_SLUG },
      }),
  };

  // Org admin items in order matching Figma design
  // Note: "Projects" section is also shown via SidebarProjectsSection
  const orgAdminItems: NavigationSidebarItem[] = [
    tasksItem,
    connectionsItem,
    projectsItem,
    storeItem,
    agentsItem,
    monitorItem,
    membersItem,
  ];

  // Plugin items mapped to navigation items
  const pluginItems: NavigationSidebarItem[] = enabledPluginItems.map(
    (item) => ({
      key: item.pluginId,
      label: item.label,
      icon: item.icon,
      onClick: () =>
        navigate({
          to: "/$org/$project/$pluginId",
          params: {
            org,
            project,
            pluginId: item.pluginId,
          },
        }),
    }),
  );

  if (isOrgAdminProject) {
    // Org-admin sidebar layout (flat, matching Figma):
    // - Home, Tasks, Connections, Projects, Store, Agents, Monitor, Members
    // - [Divider] (if plugins exist)
    // - Plugin items
    // - "Projects" section (shown via SidebarProjectsSection)
    // (Settings is in the footer)
    const sections: SidebarSection[] = [
      {
        type: "items",
        items: [homeItem, ...orgAdminItems],
      },
    ];

    // Add plugins if any
    if (pluginItems.length > 0) {
      sections.push({ type: "divider" });
      sections.push({ type: "items", items: pluginItems });
    }

    return sections;
  }

  // Project-specific items (for regular projects, not org-admin)
  const projectTasksItem: NavigationSidebarItem = {
    key: "tasks",
    label: "Tasks",
    icon: <Target04 />,
    onClick: () =>
      navigate({
        to: "/$org/$project/tasks",
        params: { org, project },
      }),
  };

  const workflowsItem: NavigationSidebarItem = {
    key: "workflows",
    label: "Workflows",
    icon: <Dataflow03 />,
    onClick: () =>
      navigate({
        to: "/$org/$project/workflows",
        params: { org, project },
      }),
  };

  const pluginsItem: NavigationSidebarItem = {
    key: "plugins",
    label: "Plugins",
    icon: <ZapSquare />,
    onClick: () =>
      navigate({
        to: "/$org/$project/settings",
        params: { org, project },
      }),
  };

  // Regular project sidebar layout (matching Figma):
  // - Home, Tasks, Workflows, Plugins
  // - [Divider] (if enabled plugins exist)
  // - Plugin items (enabled plugins)
  // (Settings is in the footer)
  const projectItems: NavigationSidebarItem[] = [
    homeItem,
    projectTasksItem,
    workflowsItem,
    pluginsItem,
  ];

  const sections: SidebarSection[] = [{ type: "items", items: projectItems }];

  if (pluginItems.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "items", items: pluginItems });
  }

  return sections;
}

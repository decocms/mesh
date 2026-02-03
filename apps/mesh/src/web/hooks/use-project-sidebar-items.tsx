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
  Container,
  Folder,
  Home02,
  Settings01,
  Users03,
  UserSquare,
  Zap,
} from "@untitledui/icons";
import { pluginRootSidebarItems } from "../index.tsx";
import { useOrganizationSettings } from "./collections/use-organization-settings";

export function useProjectSidebarItems(): SidebarSection[] {
  const { locator, org: orgContext } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { org, project } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  // Get organization settings to filter enabled plugins
  const orgSettings = useOrganizationSettings(orgContext.id);
  const enabledPlugins = orgSettings?.enabled_plugins ?? [];

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

  const settingsItem: NavigationSidebarItem = {
    key: "settings",
    label: "Settings",
    icon: <Settings01 />,
    onClick: () =>
      navigate({
        to: isOrgAdminProject
          ? "/$org/$project/org-settings"
          : "/$org/$project/settings",
        params: { org, project },
      }),
  };

  // Org-admin specific items
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

  // Organization group items (org-admin only)
  const organizationGroupItems: NavigationSidebarItem[] = [
    {
      key: "projects",
      label: "Projects",
      icon: <Folder />,
      onClick: () =>
        navigate({
          to: "/$org/$project/projects",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
    {
      key: "store",
      label: "Store",
      icon: <Building02 />,
      onClick: () =>
        navigate({
          to: "/$org/$project/store",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
    {
      key: "monitoring",
      label: "Monitoring",
      icon: <BarChart10 />,
      onClick: () =>
        navigate({
          to: "/$org/$project/monitoring",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
    {
      key: "members",
      label: "Members",
      icon: <UserSquare />,
      onClick: () =>
        navigate({
          to: "/$org/$project/members",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
  ];

  // Automation group items (org-admin only)
  const automationGroupItems: NavigationSidebarItem[] = [
    {
      key: "workflow",
      label: "Workflows",
      icon: <Zap />,
      onClick: () =>
        navigate({
          to: "/$org/$project/workflows",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
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
    // Org-admin sidebar layout:
    // - Home, Connections, Agents
    // - [Divider]
    // - Organization group (Projects, Store, Workflows, Monitoring, Members)
    // - [Divider] (if plugins exist)
    // - Plugin items
    // - [Divider]
    // - Settings
    const sections: SidebarSection[] = [
      {
        type: "items",
        items: [homeItem, connectionsItem, agentsItem],
      },
      { type: "divider" },
      {
        type: "group",
        group: {
          id: "organization",
          label: "Organization",
          items: organizationGroupItems,
          defaultExpanded: true,
        },
      },
      { type: "divider" },
      {
        type: "group",
        group: {
          id: "automation",
          label: "Automation",
          items: automationGroupItems,
          defaultExpanded: true,
        },
      },
    ];

    // Add plugins if any
    if (pluginItems.length > 0) {
      sections.push({ type: "divider" });
      sections.push({ type: "items", items: pluginItems });
    }

    // Spacer pushes Settings to the bottom
    sections.push({ type: "spacer" });
    sections.push({ type: "items", items: [settingsItem] });

    return sections;
  }

  // Regular project sidebar layout:
  // - Home
  // - [Divider] (if plugins exist)
  // - Plugin items
  // - [Spacer]
  // - Settings (at bottom)
  const sections: SidebarSection[] = [{ type: "items", items: [homeItem] }];

  if (pluginItems.length > 0) {
    sections.push({ type: "divider" });
    sections.push({ type: "items", items: pluginItems });
  }

  // Spacer pushes Settings to the bottom
  sections.push({ type: "spacer" });
  sections.push({ type: "items", items: [settingsItem] });

  return sections;
}

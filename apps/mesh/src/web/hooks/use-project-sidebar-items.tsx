import { Locator, ORG_ADMIN_PROJECT_SLUG } from "@decocms/mesh-sdk";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { NavigationSidebarItem } from "@/web/components/sidebar/types";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart10,
  Building02,
  Container,
  Home02,
  Settings01,
  Users03,
  UserSquare,
  Zap,
} from "@untitledui/icons";
import { pluginRootSidebarItems } from "../index.tsx";
import { useOrganizationSettings } from "./collections/use-organization-settings";

export function useProjectSidebarItems() {
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

  const KNOWN_ORG_ADMIN_SIDEBAR_ITEMS: NavigationSidebarItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <Home02 />,
      onClick: () => {
        if (isOnHome) {
          // Trigger a custom event to reset home view
          window.dispatchEvent(new CustomEvent("reset-home-view"));
        } else {
          navigate({
            to: "/$org/$project",
            params: { org, project: ORG_ADMIN_PROJECT_SLUG },
          });
        }
      },
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
    ...enabledPluginItems.map((item) => ({
      key: item.pluginId,
      label: item.label,
      icon: item.icon,
      onClick: () =>
        navigate({
          to: "/$org/$project/$pluginId",
          params: {
            org,
            project: ORG_ADMIN_PROJECT_SLUG,
            pluginId: item.pluginId,
          },
        }),
    })),
    {
      key: "mcps",
      label: "Connections",
      icon: <Container />,
      onClick: () =>
        navigate({
          to: "/$org/$project/mcps",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
    {
      key: "agents",
      label: "Agents",
      icon: <Users03 />,
      onClick: () =>
        navigate({
          to: "/$org/$project/agents",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
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
    {
      key: "settings",
      label: "Settings",
      icon: <Settings01 />,
      onClick: () =>
        navigate({
          to: "/$org/$project/org-settings",
          params: { org, project: ORG_ADMIN_PROJECT_SLUG },
        }),
    },
  ];

  return isOrgAdminProject ? KNOWN_ORG_ADMIN_SIDEBAR_ITEMS : [];
}

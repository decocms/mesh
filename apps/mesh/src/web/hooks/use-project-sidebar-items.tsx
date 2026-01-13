import { Locator } from "@/web/lib/locator";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart10,
  Building02,
  Container,
  CpuChip02,
  Home02,
  Settings01,
  Users01,
  Zap,
} from "@untitledui/icons";
import { pluginRootSidebarItems } from "../index.tsx";
import { useOrganizationSettings } from "./collections/use-organization-settings";

export function useProjectSidebarItems() {
  const { locator, org: orgContext } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { org } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  // Get organization settings to filter enabled plugins
  const orgSettings = useOrganizationSettings(orgContext.id);
  const enabledPlugins = orgSettings?.enabled_plugins ?? [];

  // Filter plugins to only show enabled ones
  const enabledPluginItems = pluginRootSidebarItems.filter((item) =>
    enabledPlugins.includes(item.pluginId),
  );

  const isOnHome =
    routerState.location.pathname === `/${org}` ||
    routerState.location.pathname === `/${org}/`;

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
          navigate({ to: "/$org", params: { org } });
        }
      },
    },
    {
      key: "store",
      label: "Store",
      icon: <Building02 />,
      onClick: () => navigate({ to: "/$org/store", params: { org } }),
    },
    ...enabledPluginItems.map((item) => ({
      key: item.pluginId,
      label: item.label,
      icon: item.icon,
      onClick: () =>
        navigate({
          to: "/$org/$pluginId",
          params: { org, pluginId: item.pluginId },
        }),
    })),
    {
      key: "mcps",
      label: "Connections",
      icon: <Container />,
      onClick: () => navigate({ to: "/$org/mcps", params: { org } }),
    },
    {
      key: "gateways",
      label: "Agents",
      icon: <CpuChip02 />,
      onClick: () => navigate({ to: "/$org/gateways", params: { org } }),
    },
    {
      key: "workflow",
      label: "Workflows",
      icon: <Zap />,
      onClick: () => navigate({ to: "/$org/workflows", params: { org } }),
    },
    {
      key: "monitoring",
      label: "Monitoring",
      icon: <BarChart10 />,
      onClick: () => navigate({ to: "/$org/monitoring", params: { org } }),
    },
    {
      key: "members",
      label: "Members",
      icon: <Users01 />,
      onClick: () => navigate({ to: "/$org/members", params: { org } }),
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Settings01 />,
      onClick: () => navigate({ to: "/$org/settings", params: { org } }),
    },
  ];

  return isOrgAdminProject ? KNOWN_ORG_ADMIN_SIDEBAR_ITEMS : [];
}

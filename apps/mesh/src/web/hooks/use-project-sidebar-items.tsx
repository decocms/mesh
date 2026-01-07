import { useProjectContext } from "@/web/providers/project-context-provider";
import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { Locator } from "@/web/lib/locator";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home02,
  Building02,
  Container,
  CpuChip02,
  Users01,
  Settings01,
  BarChart10,
  Zap,
} from "@untitledui/icons";

export function useProjectSidebarItems() {
  const { locator } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { org } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

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
    {
      key: "mcps",
      label: "Connections",
      icon: <Container />,
      onClick: () => navigate({ to: "/$org/mcps", params: { org } }),
    },
    {
      key: "gateways",
      label: "Hubs",
      icon: <CpuChip02 />,
      onClick: () => navigate({ to: "/$org/gateways", params: { org } }),
    },
    {
      key: "workflow",
      label: "Workflows",
      icon: <Zap />,
      onClick: () => navigate({ to: "/$org/workflow", params: { org } }),
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

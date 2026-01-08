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
import { useDetailRouteContext } from "./use-detail-route-context";

export function useProjectSidebarItems(): NavigationSidebarItem[] {
  const { locator } = useProjectContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const detailContext = useDetailRouteContext();
  const { org } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  const pathname = routerState.location.pathname;
  const segments = pathname.split("/");

  if (!isOrgAdminProject || !!detailContext) {
    return [];
  }

  return [
    {
      key: "home",
      label: "Home",
      icon: <Home02 />,
      isActive: segments.length === 2,
      onClick: () => navigate({ to: "/$org", params: { org } }),
    },
    {
      key: "store",
      label: "Store",
      icon: <Building02 />,
      isActive: segments.length === 3 && segments[2] === "store",
      onClick: () => navigate({ to: "/$org/store", params: { org } }),
    },
    {
      key: "mcps",
      label: "Connections",
      icon: <Container />,
      isActive: segments.length === 3 && segments[2] === "mcps",
      onClick: () => navigate({ to: "/$org/mcps", params: { org } }),
    },
    {
      key: "gateways",
      label: "Hubs",
      icon: <CpuChip02 />,
      isActive: segments.length === 3 && segments[2] === "gateways",
      onClick: () => navigate({ to: "/$org/gateways", params: { org } }),
    },
    {
      key: "workflow",
      label: "Workflows",
      icon: <Zap />,
      isActive: segments.length === 3 && segments[2] === "workflows",
      onClick: () => navigate({ to: "/$org/workflows", params: { org } }),
    },
    {
      key: "monitoring",
      label: "Monitoring",
      icon: <BarChart10 />,
      isActive: segments.length === 3 && segments[2] === "monitoring",
      onClick: () => navigate({ to: "/$org/monitoring", params: { org } }),
    },
    {
      key: "members",
      label: "Members",
      icon: <Users01 />,
      isActive: segments.length === 3 && segments[2] === "members",
      onClick: () => navigate({ to: "/$org/members", params: { org } }),
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Settings01 />,
      isActive: segments.length === 3 && segments[2] === "settings",
      onClick: () => navigate({ to: "/$org/settings", params: { org } }),
    },
  ];
}

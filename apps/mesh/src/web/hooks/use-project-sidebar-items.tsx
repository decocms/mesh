import { useProjectContext } from "@/web/providers/project-context-provider";
import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { Locator } from "@/web/lib/locator";
import { useNavigate } from "@tanstack/react-router";
import {
  Home01,
  ShoppingBag01,
  PuzzlePiece01,
  Share07,
  BarChartSquare02,
  Users01,
  Settings01,
} from "@untitledui/icons";

export function useProjectSidebarItems() {
  const { locator } = useProjectContext();
  const navigate = useNavigate();
  const { org } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  const KNOWN_ORG_ADMIN_SIDEBAR_ITEMS: NavigationSidebarItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <Home01 />,
      onClick: () => navigate({ to: "/$org", params: { org } }),
    },
    {
      key: "store",
      label: "Store",
      icon: <ShoppingBag01 />,
      onClick: () => navigate({ to: "/$org/store", params: { org } }),
    },
    {
      key: "mcps",
      label: "MCP Servers",
      icon: <PuzzlePiece01 />,
      onClick: () => navigate({ to: "/$org/mcps", params: { org } }),
    },
    {
      key: "gateways",
      label: "MCP Gateways",
      icon: <Share07 />,
      onClick: () => navigate({ to: "/$org/gateways", params: { org } }),
    },
    {
      key: "monitoring",
      label: "Monitoring",
      icon: <BarChartSquare02 />,
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

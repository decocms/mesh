/**
 * Toolbox Sidebar
 *
 * Sidebar navigation for the toolbox focus mode.
 * Shows toolbox-specific navigation: Home, Store, Connections, Settings, Monitoring.
 */

import { useProjectContext } from "@/web/providers/project-context-provider";
import { useToolboxContext } from "@/web/providers/toolbox-context-provider";
import {
  NavigationSidebar,
  type NavigationSidebarItem,
} from "@deco/ui/components/navigation-sidebar.tsx";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Home02, Container, Settings01, BarChart10 } from "@untitledui/icons";

export function ToolboxSidebar() {
  const { org } = useProjectContext();
  const { toolboxId } = useToolboxContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Determine active item based on current path
  const getActiveKey = (): string => {
    const basePath = `/${org.slug}/toolbox/${toolboxId}`;
    if (pathname === basePath || pathname === `${basePath}/`) return "home";
    if (pathname.includes("/connections")) return "connections";
    if (pathname.includes("/settings")) return "settings";
    if (pathname.includes("/monitoring")) return "monitoring";
    return "home";
  };

  const activeKey = getActiveKey();

  const sidebarItems: NavigationSidebarItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <Home02 />,
      isActive: activeKey === "home",
      onClick: () =>
        navigate({
          to: "/$org/toolbox/$toolboxId",
          params: { org: org.slug, toolboxId },
        }),
    },
    {
      key: "connections",
      label: "Connections",
      icon: <Container />,
      isActive: activeKey === "connections",
      onClick: () =>
        navigate({
          to: "/$org/toolbox/$toolboxId/connections",
          params: { org: org.slug, toolboxId },
        }),
    },
    {
      key: "monitoring",
      label: "Monitoring",
      icon: <BarChart10 />,
      isActive: activeKey === "monitoring",
      onClick: () =>
        navigate({
          to: "/$org/toolbox/$toolboxId/monitoring",
          params: { org: org.slug, toolboxId },
        }),
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Settings01 />,
      isActive: activeKey === "settings",
      onClick: () =>
        navigate({
          to: "/$org/toolbox/$toolboxId/settings",
          params: { org: org.slug, toolboxId },
        }),
    },
  ];

  return <NavigationSidebar navigationItems={sidebarItems} />;
}

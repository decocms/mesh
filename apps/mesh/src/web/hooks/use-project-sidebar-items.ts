import { useProjectContext } from "@/web/providers/project-context-provider";
import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Locator, ProjectLocator } from "@/web/lib/locator";
import { useNavigate } from "@tanstack/react-router";
import { KEYS } from "@/web/lib/query-keys";

async function getProjectSidebarItems({
  locator,
  navigate,
}: {
  locator: ProjectLocator;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { org } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  const KNOWN_ORG_ADMIN_SIDEBAR_ITEMS: NavigationSidebarItem[] = [
    {
      key: "store",
      label: "Store",
      icon: "shopping_bag",
      onClick: () => navigate({ to: "/$org/store", params: { org } }),
    },
    {
      key: "mcps",
      label: "MCP Servers",
      icon: "grid_view",
      onClick: () => navigate({ to: "/$org/mcps", params: { org } }),
    },
    {
      key: "monitoring",
      label: "Monitoring",
      icon: "monitoring",
      onClick: () => navigate({ to: "/$org/monitoring", params: { org } }),
    },
    {
      key: "members",
      label: "Members",
      icon: "group",
      onClick: () => navigate({ to: "/$org/members", params: { org } }),
    },
    {
      key: "settings",
      label: "Settings",
      icon: "settings",
      onClick: () => navigate({ to: "/$org/settings", params: { org } }),
    },
  ];

  const navigationItems: NavigationSidebarItem[] = isOrgAdminProject
    ? KNOWN_ORG_ADMIN_SIDEBAR_ITEMS
    : [];

  return Promise.resolve(navigationItems);
}

export function useProjectSidebarItems() {
  const { locator } = useProjectContext();
  const navigate = useNavigate();

  const { data: sidebarItems } = useSuspenseQuery({
    queryKey: KEYS.sidebarItems(locator),
    queryFn: () => getProjectSidebarItems({ locator, navigate }),
  });

  return sidebarItems;
}

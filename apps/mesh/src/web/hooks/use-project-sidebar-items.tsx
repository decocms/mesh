import { useProjectContext } from "@/web/providers/project-context-provider";
import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { Locator } from "@/web/lib/locator";
import { useNavigate } from "@tanstack/react-router";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useFileStorageConnections } from "@/web/hooks/use-binding";
import {
  Home02,
  Building02,
  Container,
  CpuChip02,
  Users01,
  Settings01,
  BarChart10,
  Folder,
} from "@untitledui/icons";

export function useProjectSidebarItems() {
  const { locator } = useProjectContext();
  const navigate = useNavigate();
  const { org } = Locator.parse(locator);
  const isOrgAdminProject = Locator.isOrgAdminProject(locator);

  // Get file storage connections to conditionally show Files menu
  const allConnections = useConnections();
  const fileStorageConnections = useFileStorageConnections(allConnections);
  const hasFileStorage = fileStorageConnections.length > 0;

  const KNOWN_ORG_ADMIN_SIDEBAR_ITEMS: NavigationSidebarItem[] = [
    {
      key: "home",
      label: "Home",
      icon: <Home02 />,
      onClick: () => navigate({ to: "/$org", params: { org } }),
    },
    {
      key: "store",
      label: "Store",
      icon: <Building02 />,
      onClick: () => navigate({ to: "/$org/store", params: { org } }),
    },
    // Only show Files menu when there are file storage connections
    ...(hasFileStorage
      ? [
          {
            key: "files",
            label: "Files",
            icon: <Folder />,
            onClick: () => navigate({ to: "/$org/files", params: { org } }),
          },
        ]
      : []),
    {
      key: "mcps",
      label: "MCP Servers",
      icon: <Container />,
      onClick: () => navigate({ to: "/$org/mcps", params: { org } }),
    },
    {
      key: "gateways",
      label: "MCP Gateways",
      icon: <CpuChip02 />,
      onClick: () => navigate({ to: "/$org/gateways", params: { org } }),
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

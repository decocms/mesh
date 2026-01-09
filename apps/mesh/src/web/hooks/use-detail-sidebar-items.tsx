import type { ConnectionEntity } from "@/tools/connection/schema";
import { NavigationSidebarItem } from "@deco/ui/components/navigation-sidebar.js";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen01,
  Container,
  FileCheck02,
  Lightbulb02,
  Settings01,
  Tool01,
} from "@untitledui/icons";
import { useConnectionDetailTabs } from "./use-connection-detail-tabs";
import { useGatewayDetailTabs } from "./use-gateway-detail-tabs";

interface UseDetailSidebarItemsProps {
  kind: "gateway" | "connection";
  org: string;
  itemId: string;
  // For connection tabs, we need these props
  connection?: ConnectionEntity | null;
  prompts?: Array<{ name: string; description?: string }>;
  resources?: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
}

/**
 * Returns sidebar items for gateway or connection detail pages.
 * These become the primary navigation items when in detail context.
 */
export function useDetailSidebarItems({
  kind,
  org,
  itemId,
  connection,
  prompts = [],
  resources = [],
}: UseDetailSidebarItemsProps): NavigationSidebarItem[] {
  const navigate = useNavigate();

  // Always call hooks unconditionally to satisfy Rules of Hooks
  const gatewayTabs = useGatewayDetailTabs();
  const connectionTabs = useConnectionDetailTabs({
    connection,
    prompts,
    resources,
  });

  const { tabs, activeTabId } =
    kind === "gateway" ? gatewayTabs : connectionTabs;

  // Map tab IDs to icons
  const getIconForTab = (tabId: string) => {
    switch (tabId) {
      case "settings":
        return <Settings01 />;
      case "tools":
        return <Tool01 />;
      case "resources":
        return <FileCheck02 />;
      case "prompts":
        return <Lightbulb02 />;
      case "readme":
        return <BookOpen01 />;
      default:
        // Dynamic collection tabs
        return <Container />;
    }
  };

  return tabs.map((tab) => ({
    key: tab.id,
    label: tab.count ? `${tab.label} (${tab.count})` : tab.label,
    icon: getIconForTab(tab.id),
    isActive: tab.id === activeTabId,
    onClick: () => {
      if (kind === "gateway") {
        if (tab.id === "settings") {
          navigate({
            to: "/$org/gateways/$gatewayId",
            params: { org, gatewayId: itemId },
            replace: true,
          });
          return;
        }

        navigate({
          to: "/$org/gateways/$gatewayId/$tab",
          params: { org, gatewayId: itemId, tab: tab.id },
          replace: true,
        });
        return;
      }

      // connection
      if (tab.id === "settings") {
        navigate({
          to: "/$org/mcps/$connectionId",
          params: { org, connectionId: itemId },
          replace: true,
        });
        return;
      }

      navigate({
        to: "/$org/mcps/$connectionId/$tab",
        params: { org, connectionId: itemId, tab: tab.id },
        replace: true,
      });
    },
  }));
}

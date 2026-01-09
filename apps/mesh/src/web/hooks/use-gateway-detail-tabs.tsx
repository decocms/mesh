import { useNavigate, useParams } from "@tanstack/react-router";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface GatewayDetailTabsResult {
  tabs: TabItem[];
  activeTabId: string;
  setTab: (tabId: string) => void;
}

/**
 * Centralized hook for gateway detail tabs.
 * Returns the tab list, active tab, and a setter function.
 */
export function useGatewayDetailTabs(): GatewayDetailTabsResult {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    org: string;
    gatewayId: string;
    tab?: string;
  };
  const org = params.org;
  const gatewayId = params.gatewayId;
  const tabFromPath = params.tab;

  const tabs: TabItem[] = [
    { id: "settings", label: "Settings" },
    { id: "tools", label: "Tools" },
    { id: "resources", label: "Resources" },
    { id: "prompts", label: "Prompts" },
  ];

  const requestedTabId = tabFromPath || "settings";

  const activeTabId = tabs.some((t) => t.id === requestedTabId)
    ? requestedTabId
    : "settings";

  const setTab = (tabId: string) => {
    if (tabId === "settings") {
      navigate({
        to: "/$org/gateways/$gatewayId",
        params: { org, gatewayId },
        replace: true,
      });
      return;
    }

    navigate({
      to: "/$org/gateways/$gatewayId/$tab",
      params: { org, gatewayId, tab: tabId },
      replace: true,
    });
  };

  return {
    tabs,
    activeTabId,
    setTab,
  };
}

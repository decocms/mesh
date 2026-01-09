import type { ConnectionEntity } from "@/tools/connection/schema";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCollectionBindings } from "./use-binding";
import { useMCPAuthStatus } from "./use-mcp-auth-status";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface ConnectionDetailTabsResult {
  tabs: TabItem[];
  activeTabId: string;
  setTab: (tabId: string) => void;
}

interface UseConnectionDetailTabsProps {
  connection: ConnectionEntity | null | undefined;
  prompts: Array<{ name: string; description?: string }>;
  resources: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
}

interface BuildConnectionTabsProps {
  connection: ConnectionEntity | null | undefined;
  isMCPAuthenticated: boolean;
  promptsCount: number;
  resourcesCount: number;
  collections?: Array<{ name: string; displayName: string }> | null;
  hasRepository: boolean;
}

/**
 * Pure helper to build connection tabs without relying on current route params.
 * Can be used in contexts where we need to compute tabs for arbitrary connections.
 */
export function buildConnectionTabs({
  connection,
  isMCPAuthenticated,
  promptsCount,
  resourcesCount,
  collections,
  hasRepository,
}: BuildConnectionTabsProps): TabItem[] {
  const toolsCount = connection?.tools?.length ?? 0;

  return [
    { id: "settings", label: "Settings" },
    ...(isMCPAuthenticated && toolsCount > 0
      ? [{ id: "tools", label: "Tools", count: toolsCount }]
      : []),
    ...(isMCPAuthenticated && promptsCount > 0
      ? [{ id: "prompts", label: "Prompts", count: promptsCount }]
      : []),
    ...(isMCPAuthenticated && resourcesCount > 0
      ? [{ id: "resources", label: "Resources", count: resourcesCount }]
      : []),
    ...(isMCPAuthenticated
      ? (collections || []).map((c) => ({ id: c.name, label: c.displayName }))
      : []),
    ...(hasRepository ? [{ id: "readme", label: "README" }] : []),
  ];
}

/**
 * Centralized hook for connection detail tabs.
 * Returns the tab list (including dynamic collections), active tab, and a setter function.
 */
export function useConnectionDetailTabs({
  connection,
  prompts,
  resources,
}: UseConnectionDetailTabsProps): ConnectionDetailTabsResult {
  const params = useParams({ strict: false }) as {
    org: string;
    connectionId: string;
    tab?: string;
  };
  const org = params.org;
  const connectionId = params.connectionId;
  const tabFromPath = params.tab;
  const navigate = useNavigate();

  const authStatus = useMCPAuthStatus({
    connectionId,
  });
  const isMCPAuthenticated = authStatus.isAuthenticated;

  // Detect collection bindings
  const collections = useCollectionBindings(connection ?? undefined);

  // Check if connection has repository info for README tab (stored in metadata)
  const repository = connection?.metadata?.repository as
    | { url?: string; source?: string; subfolder?: string }
    | undefined;
  const hasRepository = !!repository?.url;

  const promptsCount = prompts.length;
  const resourcesCount = resources.length;

  const tabs = buildConnectionTabs({
    connection,
    isMCPAuthenticated,
    promptsCount,
    resourcesCount,
    collections,
    hasRepository,
  });

  const requestedTabId = tabFromPath || "settings";

  const activeTabId = tabs.some((t) => t.id === requestedTabId)
    ? requestedTabId
    : "settings";

  const setTab = (tabId: string) => {
    if (tabId === "settings") {
      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org, connectionId },
        replace: true,
      });
      return;
    }

    navigate({
      to: "/$org/mcps/$connectionId/$tab",
      params: { org, connectionId, tab: tabId },
      replace: true,
    });
  };

  return {
    tabs,
    activeTabId,
    setTab,
  };
}

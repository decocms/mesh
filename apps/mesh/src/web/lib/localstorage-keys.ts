import type { ProjectLocator } from "./locator";

/**
 * Known localStorage keys for the mesh app.
 * When adding a new use of useLocalStorage, add the key to this object.
 * This is used to avoid inline key definitions and to ensure consistency.
 */
export const LOCALSTORAGE_KEYS = {
  decoChatOpen: () => `mesh:decochat:open`,
  threadManagerState: (locator: ProjectLocator) =>
    `mesh:thread-manager-state:${locator}`,
  chatSelectedModel: (locator: ProjectLocator) =>
    `mesh:chat:selectedModel:${locator}`,
  assistantChatActiveThread: (locator: ProjectLocator, assistantId: string) =>
    `mesh:assistant-chat:active-thread:${locator}:${assistantId}`,
  virtualMcpChatActiveThread: (locator: ProjectLocator, virtualMcpId: string) =>
    `mesh:virtual-mcp-chat:active-thread:${locator}:${virtualMcpId}` as const,
  decoChatPanelWidth: () => `mesh:decochat:panel-width`,
  sidebarOpen: () => `mesh:sidebar-open`,
  selectedRegistry: (org: string) => `mesh:store:selected-registry:${org}`,
  orgHomeQuickstart: (org: string) => `mesh:org-home:quickstart:${org}`,
  virtualMcpSystemPrompts: (locator: ProjectLocator) =>
    `mesh:virtual-mcp:system-prompts:${locator}`,
  storeShowStdio: () => `mesh:store:show-stdio`,
  developerMode: () => `mesh:user:developer-mode`,
  pluginConnection: (org: string, pluginId: string) =>
    `mesh:plugin:connection:${org}:${pluginId}`,
} as const;

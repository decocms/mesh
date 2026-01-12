import { EmptyState } from "@/web/components/empty-state";
import { ReadmeViewer } from "@/web/components/store/readme-viewer";
import { Loading01 } from "@untitledui/icons";
import { ToolsList, type Tool } from "@/web/components/tools";
import { ResourceTabs } from "@deco/ui/components/resource-tabs.tsx";
import { MCPServersList } from "./mcp-servers-list";
import type { MCPServerData, TabItem, UnifiedServerEntry } from "./types";

interface MCPServerTabsContentProps {
  data: MCPServerData;
  availableTabs: TabItem[];
  effectiveActiveTabId: string;
  effectiveTools: unknown[];
  isLoadingTools?: boolean;
  onTabChange: (tabId: string) => void;
  /** Unified list of remotes and packages for the servers list tab */
  servers?: UnifiedServerEntry[];
  /** Callback when user clicks to install a server entry */
  onInstallServer?: (entry: UnifiedServerEntry) => void;
  /** Whether an installation is in progress */
  isInstalling?: boolean;
  /** Icon for the MCP server */
  mcpIcon?: string | null;
  /** Name of the MCP server */
  mcpName?: string;
}

export function MCPServerTabsContent({
  data,
  availableTabs,
  effectiveActiveTabId,
  effectiveTools,
  isLoadingTools = false,
  onTabChange,
  servers = [],
  onInstallServer,
  isInstalling = false,
  mcpIcon,
  mcpName,
}: MCPServerTabsContentProps) {
  // Convert tools to the expected format
  const tools: Tool[] = effectiveTools.map((tool) => {
    const t = tool as Record<string, unknown>;
    return {
      name: (t.name as string) || "",
      description: (t.description as string) || undefined,
    };
  });

  return (
    <div className="lg:col-span-2 flex flex-col border-l border-border">
      {/* Tabs Section */}
      {availableTabs.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-background">
          <ResourceTabs
            tabs={availableTabs}
            activeTab={effectiveActiveTabId}
            onTabChange={onTabChange}
          />
        </div>
      )}

      {/* Servers Tab Content */}
      {effectiveActiveTabId === "servers" && servers.length > 0 && (
        <div className="flex-1 overflow-y-auto bg-background">
          <MCPServersList
            servers={servers}
            onInstall={(entry) => onInstallServer?.(entry)}
            isInstalling={isInstalling}
            icon={mcpIcon}
            mcpName={mcpName}
          />
        </div>
      )}

      {/* Tools Tab Content */}
      {effectiveActiveTabId === "tools" && (
        <div className="flex flex-col flex-1">
          {isLoadingTools ? (
            <div className="flex items-center justify-center p-8">
              <Loading01 size={24} className="animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading tools...
              </span>
            </div>
          ) : effectiveTools.length > 0 ? (
            <ToolsList
              tools={tools}
              showToolbar={false}
              emptyMessage="This MCP Server doesn't have any tools."
            />
          ) : (
            <EmptyState
              image={null}
              title="No tools available"
              description="This MCP Server doesn't have any tools."
            />
          )}
        </div>
      )}

      {/* README Tab Content */}
      {effectiveActiveTabId === "readme" && (
        <div className="flex-1 overflow-y-auto bg-background">
          <ReadmeViewer repository={data?.repository} />
        </div>
      )}
    </div>
  );
}

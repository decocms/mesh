import { ReadmeViewer } from "@deco/ui/components/readme-viewer.tsx";
import { Loading01 } from "@untitledui/icons";
import { ResourceTabs } from "@deco/ui/components/resource-tabs.tsx";
import type { MCPServerData, TabItem } from "./types";

interface Tool {
  name: string;
  description?: string;
}

interface MCPServerTabsContentProps {
  data: MCPServerData;
  availableTabs: TabItem[];
  effectiveActiveTabId: string;
  effectiveTools: unknown[];
  isLoadingTools?: boolean;
  onTabChange: (tabId: string) => void;
}

export function MCPServerTabsContent({
  data,
  availableTabs,
  effectiveActiveTabId,
  effectiveTools,
  isLoadingTools = false,
  onTabChange,
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
            <div className="divide-y divide-border">
              {tools.map((tool) => (
                <div key={tool.name} className="px-4 py-3">
                  <div className="font-medium text-sm">{tool.name}</div>
                  {tool.description && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {tool.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-muted-foreground text-sm">
                This MCP Server doesn't have any tools.
              </p>
            </div>
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

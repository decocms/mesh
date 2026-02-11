import { EmptyState } from "@/web/components/empty-state";
import { ReadmeViewer } from "@/web/components/readme";
import { Loading01 } from "@untitledui/icons";
import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import { ToolsList, type Tool } from "@/web/components/tools";

/**
 * Strip dangerous HTML tags from marked output to prevent XSS.
 * Marked does not sanitize by default; this is a lightweight filter
 * that removes script, iframe, object, embed, form, and event handlers.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s>][\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s>][\s\S]*?>/gi, "")
    .replace(/<form[\s>][\s\S]*?<\/form>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}
import { CollectionTabs } from "@/web/components/collections/collection-tabs.tsx";
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
  /** Show STDIO servers in the list */
  showStdio?: boolean;
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
  showStdio = false,
}: MCPServerTabsContentProps) {
  const hasEmbeddedReadme = Boolean(data.readmeMarkdown?.trim());
  const hasReadmeUrl = Boolean(data.readmeUrl?.trim());
  const embeddedReadmeHtml = hasEmbeddedReadme
    ? sanitizeHtml(
        marked.parse(data.readmeMarkdown ?? "", { async: false }) as string,
      )
    : null;

  const { data: fetchedReadmeHtml, isLoading: isLoadingReadmeUrl } = useQuery({
    queryKey: ["store-readme-url", data.readmeUrl],
    queryFn: async () => {
      if (!data.readmeUrl) return null;
      const response = await fetch(data.readmeUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch README (${response.status})`);
      }
      const markdown = await response.text();
      return sanitizeHtml(marked.parse(markdown, { async: false }) as string);
    },
    enabled: hasReadmeUrl && !hasEmbeddedReadme,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const customReadmeHtml = embeddedReadmeHtml ?? fetchedReadmeHtml ?? null;
  const customReadmeLoading = !hasEmbeddedReadme && isLoadingReadmeUrl;

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
          <CollectionTabs
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
            showStdio={showStdio}
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
          {hasEmbeddedReadme || hasReadmeUrl ? (
            <ReadmeViewer
              html={customReadmeHtml}
              isLoading={customReadmeLoading}
            />
          ) : (
            <ReadmeViewer repository={data?.repository} />
          )}
        </div>
      )}
    </div>
  );
}

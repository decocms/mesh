import {
  fetchVirtualMCPResource,
  fetchVirtualMCPResources,
  type VirtualMCPResource,
} from "@/web/hooks/use-virtual-mcp-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useQueryClient } from "@tanstack/react-query";
import type { Editor, Range } from "@tiptap/react";
import { toast } from "sonner";
import { BaseItem, insertMention, OnSelectProps, Suggestion } from "./mention";

interface ResourcesMentionProps {
  editor: Editor;
  virtualMcpId: string | null;
}

interface ResourceItem extends BaseItem {
  uri: string;
}

/**
 * Fetches a resource and inserts it as a mention node in the editor.
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param orgSlug - The organization slug
 */
async function fetchAndInsertResource(
  editor: Editor,
  range: Range,
  virtualMcpId: string | null,
  orgSlug: string,
  resourceUri: string,
) {
  try {
    const result = await fetchVirtualMCPResource(virtualMcpId, orgSlug, resourceUri);

    insertMention(editor, range, {
      id: resourceUri,
      name: resourceUri,
      metadata: result.contents,
      char: "@",
    });
  } catch (error) {
    console.error("[resource] Failed to fetch resource:", error);
    toast.error("Failed to load resource. Please try again.");
  }
}

export const ResourcesMention = ({
  editor,
  virtualMcpId,
}: ResourcesMentionProps) => {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  // Use the query key helper which handles null (default virtual MCP)
  const queryKey = KEYS.virtualMcpResources(virtualMcpId, org.slug);

  const handleItemSelect = async ({
    item,
    range,
  }: OnSelectProps<ResourceItem>) => {
    // virtualMcpId can be null (default virtual MCP)
    await fetchAndInsertResource(editor, range, virtualMcpId, org.slug, item.uri);
  };

  const fetchItems = async (props: { query: string }) => {
    const { query } = props;

    // Try to get from cache first (even if stale)
    let virtualMcpResources =
      queryClient.getQueryData<VirtualMCPResource[]>(queryKey);

    // If not in cache or we want fresh data, fetch from network
    // fetchQuery will use cache if fresh, otherwise fetch
    if (!virtualMcpResources) {
      virtualMcpResources = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => fetchVirtualMCPResources(virtualMcpId, org.slug),
        staleTime: 60000, // 1 minute
      });
    } else {
      // Prefetch in background to ensure fresh data
      queryClient
        .fetchQuery({
          queryKey,
          queryFn: () => fetchVirtualMCPResources(virtualMcpId, org.slug),
          staleTime: 60000,
        })
        .catch(() => {
          // Ignore errors in background fetch
        });
    }

    // Ensure we have resources (fallback to empty array)
    if (!virtualMcpResources) {
      return [];
    }

    // Filter resources based on query
    let filteredResources = virtualMcpResources;
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filteredResources = virtualMcpResources.filter(
        (r) =>
          r.uri.toLowerCase().includes(lowerQuery) ||
          r.name?.toLowerCase().includes(lowerQuery) ||
          r.description?.toLowerCase().includes(lowerQuery),
      );
    }

    // Map VirtualMCPResource to ResourceItem format (extends BaseItem)
    return filteredResources.map((r) => ({
      name: r.name ?? r.uri,
      title: r.name,
      description: r.description,
      uri: r.uri,
    })) as ResourceItem[];
  };

  return (
    <Suggestion<ResourceItem>
      editor={editor}
      char="@"
      pluginKey="resourcesDropdownMenu"
      queryKey={queryKey}
      queryFn={fetchItems}
      onSelect={handleItemSelect}
    />
  );
};

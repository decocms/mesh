import { KEYS } from "@/web/lib/query-keys";
import {
  listResources,
  readResource,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
 */
async function fetchAndInsertResource(
  editor: Editor,
  range: Range,
  client: Client,
  resourceUri: string,
) {
  try {
    const result = await readResource(client, resourceUri);

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
  const client = useMCPClient({
    connectionId: virtualMcpId,
    orgSlug: org.slug,
  });
  // Use the query key helper which handles null (default virtual MCP)
  const queryKey = KEYS.virtualMcpResources(virtualMcpId, org.slug);

  const handleItemSelect = async ({
    item,
    range,
  }: OnSelectProps<ResourceItem>) => {
    if (!client) return;
    await fetchAndInsertResource(editor, range, client, item.uri);
  };

  const fetchItems = async (props: { query: string }) => {
    const { query } = props;

    if (!client) return [];

    // Try to get from cache first (even if stale)
    let virtualMcpResources = queryClient.getQueryData<Resource[]>(queryKey);

    // If not in cache or we want fresh data, fetch from network
    // fetchQuery will use cache if fresh, otherwise fetch
    if (!virtualMcpResources) {
      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => listResources(client),
        staleTime: 60000, // 1 minute
      });
      virtualMcpResources = result.resources;
    } else {
      // Prefetch in background to ensure fresh data
      queryClient
        .fetchQuery({
          queryKey,
          queryFn: () => listResources(client),
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

    // Map Resource to ResourceItem format (extends BaseItem)
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

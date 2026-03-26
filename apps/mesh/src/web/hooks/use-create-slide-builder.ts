import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";

const SLIDE_BUILDER_CONNECTION_URL =
  "https://localhost-615c52b2.deco.host/api/mcp";

type ConnectionCreateOutput = {
  item: { id: string };
};

type VirtualMCPCreateOutput = {
  item: { id: string };
};

export function useCreateSlideBuilder() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const virtualMcps = useVirtualMCPs();

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // Check if a Slide Builder already exists
      const existing = virtualMcps.find(
        (v) =>
          (v.metadata?.ui as { slug?: string } | null | undefined)?.slug ===
          "slide-builder",
      );

      if (existing) {
        const pinnedView = (
          existing.metadata?.ui as
            | {
                pinnedViews?: {
                  connectionId: string;
                  toolName: string;
                }[];
              }
            | null
            | undefined
        )?.pinnedViews?.[0];

        const connId =
          pinnedView?.connectionId ?? existing.connections[0]?.connection_id;
        const toolName = pinnedView?.toolName ?? "slide_maker";

        return { virtualMcpId: existing.id, connId: connId ?? "", toolName };
      }

      // 1. Create the connection
      const connResult = (await client.callTool({
        name: "COLLECTION_CONNECTIONS_CREATE",
        arguments: {
          data: {
            title: "Slide Builder",
            connection_url: SLIDE_BUILDER_CONNECTION_URL,
            connection_type: "HTTP",
          },
        },
      })) as { structuredContent?: unknown };
      const connPayload = (connResult.structuredContent ??
        connResult) as ConnectionCreateOutput;
      const connId = connPayload.item.id;

      // 2. Create the virtual MCP with the connection and slide_maker pinned view
      const mcpResult = (await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_CREATE",
        arguments: {
          data: {
            title: "Slide Builder",
            description: "Build and manage presentations",
            pinned: true,
            metadata: {
              instructions: null,
              enabled_plugins: [],
              ui: {
                banner: null,
                bannerColor: "#EAB308",
                icon: "icon://PresentationChart01?color=yellow",
                themeColor: "#EAB308",
                slug: "slide-builder",
                pinnedViews: [
                  {
                    connectionId: connId,
                    toolName: "slide_maker",
                    label: "Slides",
                    icon: null,
                  },
                ],
              },
            },
            connections: [{ connection_id: connId }],
          },
        },
      })) as { structuredContent?: unknown };
      const mcpPayload = (mcpResult.structuredContent ??
        mcpResult) as VirtualMCPCreateOutput;
      const virtualMcpId = mcpPayload.item.id;

      return { virtualMcpId, connId, toolName: "slide_maker" };
    },
    onSuccess: ({ virtualMcpId, connId, toolName }) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key[1] === org.id &&
            key[3] === "collection" &&
            key[4] === "VIRTUAL_MCP"
          );
        },
      });
      queryClient.invalidateQueries({ queryKey: KEYS.projects(org.id) });
      navigate({
        to: "/$org/agents/$virtualMcpId/apps/$connectionId/$toolName",
        params: {
          org: org.slug,
          virtualMcpId,
          connectionId: connId,
          toolName,
        },
      });
    },
    onError: (err) => {
      toast.error(
        "Failed to set up Slide Builder: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    },
  });

  return {
    createSlideBuilder: () => mutation.mutate(),
    isCreating: mutation.isPending,
  };
}

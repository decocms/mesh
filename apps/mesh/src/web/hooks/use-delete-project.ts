import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";

export function useDeleteProject() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const mutation = useMutation({
    mutationFn: async (projectId: string) => {
      await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_DELETE",
        arguments: { id: projectId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.projects(org.id) });
      navigate({ to: "/$org", params: { org: org.slug } });
    },
    onError: (error) => {
      toast.error(
        "Failed to delete project: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  return {
    deleteProject: (projectId: string) => mutation.mutate(projectId),
    isDeleting: mutation.isPending,
  };
}

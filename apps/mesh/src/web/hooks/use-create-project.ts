/**
 * Hook to create a new project.
 * Projects are Virtual MCPs with metadata.type = "project".
 * They contain agents (other Virtual MCPs) and tasks.
 */

import { useVirtualMCPActions, type VirtualMCPEntity } from "@decocms/mesh-sdk";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";

export function useCreateProject(options: { navigateOnCreate?: boolean } = {}) {
  const { navigateOnCreate = false } = options;
  const actions = useVirtualMCPActions();
  const navigateToAgent = useNavigateToAgent();

  const createProject = async () => {
    const virtualMcp = await actions.create.mutateAsync({
      title: "New Project",
      description: "",
      status: "active",
      connections: [],
      pinned: true,
      metadata: {
        instructions: null,
        type: "project",
      },
    });

    if (navigateOnCreate) {
      navigateToAgent(virtualMcp.id!, { search: { main: "settings" } });
    }

    return { id: virtualMcp.id!, virtualMcp };
  };

  return {
    createProject,
    isCreating: actions.create.isPending,
  };
}

/** Check if a Virtual MCP is a project (vs an agent) */
export function isProject(entity: VirtualMCPEntity): boolean {
  return (entity.metadata as Record<string, unknown>)?.type === "project";
}

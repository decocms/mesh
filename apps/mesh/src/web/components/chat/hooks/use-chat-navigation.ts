/**
 * useChatNavigation — URL-driven chat state.
 *
 * Reads virtualMcpId from route params and taskId from search params.
 * virtualMcpId is never null — defaults to the well-known decopilot virtual MCP.
 */

import { getWellKnownDecopilotVirtualMCP } from "@decocms/mesh-sdk";
import { useMatch, useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";

export interface ChatNavigation {
  virtualMcpId: string;
  taskId: string | null;
  navigateToTask: (taskId: string) => void;
}

export function useChatNavigation(): ChatNavigation {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const search = useSearch({ strict: false }) as {
    taskId?: string;
  };

  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });

  const virtualMcpId =
    agentsMatch?.params.virtualMcpId ??
    getWellKnownDecopilotVirtualMCP(org.id).id;

  const navigateToTask = (taskId: string) => {
    if (agentsMatch) {
      navigate({
        to: "/$org/$virtualMcpId/",
        params: {
          org: org.slug,
          virtualMcpId,
        },
        search: (prev: Record<string, unknown>) => ({ ...prev, taskId }),
      });
    } else {
      navigate({
        search: { taskId } as never,
      });
    }
  };

  return {
    virtualMcpId,
    taskId: search.taskId ?? null,
    navigateToTask,
  };
}

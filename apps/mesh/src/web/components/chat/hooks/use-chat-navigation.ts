/**
 * useChatNavigation — URL-driven chat state.
 *
 * Reads virtualMcpId from route params and taskId from search params.
 * virtualMcpId is never null — defaults to the well-known decopilot virtual MCP.
 * virtualMcpOverride is an optional search param for ephemeral per-task agent switching.
 */

import { getWellKnownDecopilotVirtualMCP } from "@decocms/mesh-sdk";
import { useMatch, useNavigate, useSearch } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";

export interface ChatNavigation {
  virtualMcpId: string;
  virtualMcpOverride: string | undefined;
  /** Always defined — the router's validateSearch seeds a UUID if absent. */
  taskId: string;
  navigateToTask: (
    taskId: string,
    opts?: { virtualMcpOverride?: string },
  ) => void;
  setVirtualMcpOverride: (id: string | null) => void;
}

export function useChatNavigation(): ChatNavigation {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const search = useSearch({ strict: false }) as {
    taskId?: string;
    virtualMcpOverride?: string;
  };

  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });

  const virtualMcpId =
    agentsMatch?.params.virtualMcpId ??
    getWellKnownDecopilotVirtualMCP(org.id).id;

  const navigateToTask = (
    taskId: string,
    opts?: { virtualMcpOverride?: string },
  ) => {
    if (agentsMatch) {
      navigate({
        to: "/$org/$virtualMcpId/",
        params: {
          org: org.slug,
          virtualMcpId,
        },
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...prev, taskId };
          if (opts?.virtualMcpOverride) {
            next.virtualMcpOverride = opts.virtualMcpOverride;
          } else {
            delete next.virtualMcpOverride;
          }
          return next;
        },
      });
    } else {
      navigate({
        search: { taskId } as never,
      });
    }
  };

  const setVirtualMcpOverride = (id: string | null) => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        if (id) {
          next.virtualMcpOverride = id;
        } else {
          delete next.virtualMcpOverride;
        }
        return next;
      },
    } as never);
  };

  const taskId = search.taskId;
  if (!taskId) {
    throw new Error(
      "taskId must be present in URL search params. The router's validateSearch should seed it automatically.",
    );
  }

  return {
    virtualMcpId,
    virtualMcpOverride: search.virtualMcpOverride,
    taskId,
    navigateToTask,
    setVirtualMcpOverride,
  };
}

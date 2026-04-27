import { useRef } from "react";
import { getWellKnownDecopilotVirtualMCP } from "@decocms/mesh-sdk";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";

export interface ChatNavigation {
  /** Resolved vMCP for the current chat — either the URL param or the well-known decopilot. */
  virtualMcpId: string;
  /** Always defined — `/$org/$taskId` path param, or a stable fallback for routes that don't have it. */
  taskId: string;
  /** Navigate to a task. `virtualMcpId` becomes `?virtualmcpid=` — used as bootstrap for the route loader. */
  navigateToTask: (taskId: string, opts?: { virtualMcpId?: string }) => void;
}

export function useChatNavigation(): ChatNavigation {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const search = useSearch({ strict: false }) as { virtualmcpid?: string };
  const routeParams = useParams({ strict: false }) as { taskId?: string };

  const virtualMcpId =
    search.virtualmcpid ?? getWellKnownDecopilotVirtualMCP(org.id).id;

  const navigateToTask = (taskId: string, opts?: { virtualMcpId?: string }) => {
    navigate({
      to: "/$org/$taskId",
      params: { org: org.slug, taskId },
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = {};
        const vmcp = opts?.virtualMcpId ?? prev.virtualmcpid;
        if (vmcp) next.virtualmcpid = vmcp;
        if (prev.tasks) next.tasks = prev.tasks;
        return next;
      },
    });
  };

  // On unified chat routes the taskId is a path param.
  // On other routes (e.g. settings) Chat.Provider still mounts but taskId is
  // absent — fall back to a stable generated ID so the provider works everywhere.
  const fallbackRef = useRef(crypto.randomUUID());
  const taskId = routeParams.taskId ?? fallbackRef.current;

  return { virtualMcpId, taskId, navigateToTask };
}

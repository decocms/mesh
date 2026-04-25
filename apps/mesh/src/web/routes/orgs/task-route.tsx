import { useParams, useSearch } from "@tanstack/react-router";
import {
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useEnsureTask } from "../../hooks/use-tasks";

/**
 * Route component for `/$org/$taskId`. Ensures the thread exists (creates on
 * 404), shows a creating-task boundary while doing so, and otherwise lets the
 * surrounding layout render the chat normally — the existing chat/sidebar UI
 * reads `task.id` from the URL and `task.virtual_mcp_id` / `task.branch` from
 * the cache, both of which are populated once `useEnsureTask` resolves.
 */
export default function TaskRoute() {
  const { org } = useProjectContext();
  const params = useParams({ strict: false }) as { taskId?: string };
  const search = useSearch({ strict: false }) as { virtualmcpid?: string };

  const taskId = params.taskId;
  if (!taskId) return null; // shouldn't happen — path param

  const virtualMcpId =
    search.virtualmcpid ?? getWellKnownDecopilotVirtualMCP(org.id).id;

  const state = useEnsureTask(taskId, virtualMcpId);

  if (state.status === "creating") {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Creating task…
      </div>
    );
  }

  if (state.status === "loading") {
    return null; // existing layout shows skeleton
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-sm">
        <div className="font-medium">Task unavailable</div>
        <div className="text-muted-foreground">{state.error.message}</div>
      </div>
    );
  }

  // status === "ready" — let the layout render the chat normally.
  return null;
}

/**
 * useCreateTaskAndNavigate — for use *outside* ChatContextProvider (e.g., sidebar).
 *
 * Mints a fresh taskId and navigates to `/$org/$taskId?virtualmcpid=…`.
 * ChatContextProvider handles actual task creation on first message.
 */

import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";

/**
 * Returns a function that navigates to `/$org/$taskId?virtualmcpid=<agentId>`.
 */
export function useCreateTaskAndNavigate() {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (virtualMcpId: string) => {
    const taskId = crypto.randomUUID();
    navigate({
      to: "/$org/$taskId",
      params: { org: org.slug, taskId },
      search: { virtualmcpid: virtualMcpId },
    });
  };
}

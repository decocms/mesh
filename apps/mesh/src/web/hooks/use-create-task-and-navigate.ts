/**
 * useCreateTaskAndNavigate — for use *outside* ChatContextProvider (e.g., sidebar).
 *
 * Navigates to `/$org/$virtualMcpId`. The route's `validateSearch` auto-generates
 * a taskId if none is present, and ChatContextProvider handles task creation
 * after the real task list is fetched.
 */

import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";

/**
 * Returns a function that navigates to `/$org/$virtualMcpId/`.
 */
export function useCreateTaskAndNavigate() {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (virtualMcpId: string) => {
    navigate({
      to: "/$org/$virtualMcpId/",
      params: { org: org.slug, virtualMcpId },
    });
  };
}

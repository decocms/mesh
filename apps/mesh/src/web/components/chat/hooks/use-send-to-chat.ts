/**
 * useSendToChat — cross-module API for sending messages to chat.
 *
 * Creates an optimistic task, stores the pending message in memory,
 * and navigates to the chat route. The ChatContextProvider consumes
 * the pending message on mount.
 */

import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { addTaskToCache } from "../task/cache-operations";
import { buildOptimisticTask } from "../task/helpers";
import type { SendMessageParams } from "../store/types";

/**
 * Module-level pending message store.
 * Written by useSendToChat, consumed once by ChatContextProvider.
 */
const pendingMessages = new Map<string, SendMessageParams>();

export function consumePendingMessage(
  taskId: string,
): SendMessageParams | null {
  const msg = pendingMessages.get(taskId);
  if (msg) pendingMessages.delete(taskId);
  return msg ?? null;
}

export function useSendToChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { org, locator } = useProjectContext();

  return (params: { virtualMcpId: string; message: SendMessageParams }) => {
    const taskId = crypto.randomUUID();
    const optimisticTask = buildOptimisticTask(taskId, params.virtualMcpId);

    // Add to cache so task appears immediately in sidebar
    addTaskToCache(
      queryClient,
      locator,
      optimisticTask,
      "me",
      undefined,
      params.virtualMcpId,
    );
    addTaskToCache(
      queryClient,
      locator,
      optimisticTask,
      "everyone",
      undefined,
      params.virtualMcpId,
    );

    // Store pending message in memory (consumed once by provider)
    pendingMessages.set(taskId, params.message);

    // Navigate to the agent with the new taskId
    navigate({
      to: "/shell/$org/$virtualMcpId/",
      params: { org: org.slug, virtualMcpId: params.virtualMcpId },
      search: { taskId },
    });
  };
}

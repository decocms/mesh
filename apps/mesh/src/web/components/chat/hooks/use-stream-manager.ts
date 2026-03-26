/**
 * useStreamManager — task-scoped SSE subscription + stream resume logic.
 *
 * Listens for SSE events on the active task and resumes disconnected streams.
 */

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useDecopilotEvents } from "../../../hooks/use-decopilot-events";
import { KEYS } from "../../../lib/query-keys";
import type { ChatMessage } from "../types";

const MAX_RESUME_RETRIES = 3;

export function useStreamManager(
  threadId: string,
  orgId: string,
  chat: UseChatHelpers<ChatMessage>,
) {
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();

  const hasResumedRef = useRef<string | null>(null);
  const resumeFailCountRef = useRef(0);

  const invalidateThreadList = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.tasks(locator) });
  };

  const invalidateMessages = () => {
    if (!threadId) return;
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (key[3] !== "collection" || key[4] !== "THREAD_MESSAGES")
          return false;
        const serialized = typeof key[6] === "string" ? key[6] : "";
        return serialized.includes(threadId);
      },
    });
  };

  const isChatActive = () =>
    chat.status === "submitted" || chat.status === "streaming";

  const tryResumeStream = (reason: string) => {
    if (!threadId || hasResumedRef.current === threadId) return;
    if (resumeFailCountRef.current >= MAX_RESUME_RETRIES) return;
    if (isChatActive()) return;
    hasResumedRef.current = threadId;

    console.log(`[chat] resumeStream (${reason})`, threadId);
    chat.resumeStream().catch((err: unknown) => {
      console.error("[chat] resumeStream error", err);
      resumeFailCountRef.current++;
      hasResumedRef.current = null;
      invalidateThreadList();
      invalidateMessages();
    });
  };

  // Task-scoped SSE (for stream resume on this specific task)
  useDecopilotEvents({
    orgId,
    taskId: threadId,
    onStep: () => tryResumeStream("sse-step"),
    onFinish: () => {
      if (!isChatActive()) {
        hasResumedRef.current = null;
        resumeFailCountRef.current = 0;
        invalidateThreadList();
        setTimeout(invalidateMessages, 2000);
      }
    },
    onTaskStatus: () => {
      if (!isChatActive()) {
        invalidateThreadList();
      }
    },
  });
}

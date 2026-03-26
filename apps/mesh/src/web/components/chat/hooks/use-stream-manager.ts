/**
 * useStreamManager — task-scoped SSE subscription + stream resume logic.
 *
 * Extracted from the old TaskStreamManager component. Handles:
 * - SSE event listening for the active task (step/finish/status)
 * - Stream resume on reconnect
 * - Safety-net polling when a run is in_progress but no active stream
 */

import { useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useDecopilotEvents } from "../../../hooks/use-decopilot-events";
import { KEYS } from "../../../lib/query-keys";
import type { ChatMessage } from "../types";

const SAFETY_NET_POLL_MS = 30_000;
const MAX_RESUME_RETRIES = 3;
const getSnapshotStub = () => 0;

export function useStreamManager(
  threadId: string,
  orgId: string,
  chat: UseChatHelpers<ChatMessage>,
  isRunInProgress: boolean,
) {
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();

  const hasResumedRef = useRef<string | null>(null);
  const resumeFailCountRef = useRef(0);

  // All mutable state accessed via refs so callbacks are stable
  const stateRef = useRef({
    threadId,
    chat,
    isRunInProgress,
    locator,
    queryClient,
  });
  stateRef.current = {
    threadId,
    chat,
    isRunInProgress,
    locator,
    queryClient,
  };

  const invalidateThreadList = () => {
    stateRef.current.queryClient.invalidateQueries({
      queryKey: KEYS.tasks(stateRef.current.locator),
    });
  };

  const invalidateMessages = () => {
    const id = stateRef.current.threadId;
    if (!id) return;
    stateRef.current.queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (key[3] !== "collection" || key[4] !== "THREAD_MESSAGES")
          return false;
        const serialized = typeof key[6] === "string" ? key[6] : "";
        return serialized.includes(id);
      },
    });
  };

  const isChatActive = () => {
    const s = stateRef.current.chat.status;
    return s === "submitted" || s === "streaming";
  };

  const tryResumeStream = (reason: string) => {
    const id = stateRef.current.threadId;
    if (!id || hasResumedRef.current === id) return;
    if (resumeFailCountRef.current >= MAX_RESUME_RETRIES) return;
    if (isChatActive()) return;
    hasResumedRef.current = id;

    console.log(`[chat] resumeStream (${reason})`, id);
    stateRef.current.chat.resumeStream().catch((err: unknown) => {
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

  // Safety-net: subscribe reads from stateRef so the function itself is stable.
  // Created once via useRef to guarantee referential stability for useSyncExternalStore.
  const subscribeRef = useRef((_onStoreChange: () => void) => {
    if (!stateRef.current.isRunInProgress) return () => {};

    tryResumeStream("page-load");

    const id = setInterval(() => {
      invalidateThreadList();
      invalidateMessages();
    }, SAFETY_NET_POLL_MS);
    return () => clearInterval(id);
  });

  useSyncExternalStore(subscribeRef.current, getSnapshotStub, getSnapshotStub);
}

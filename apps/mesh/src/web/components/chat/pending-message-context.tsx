/**
 * PendingMessageProvider — cross-remount queue for "create task then send".
 *
 * Mounted ABOVE the Suspense + Chat.Provider so it outlives task-switch
 * remounts. Callers of createTaskWithMessage write here; the new task's
 * Chat.Provider reads and consumes on mount.
 */

import { createContext, use, useRef, useState, type ReactNode } from "react";
import type { SendMessageParams } from "./store/types";

const PENDING_MESSAGE_TTL_MS = 10_000;

export interface PendingMessage {
  taskId: string;
  message: SendMessageParams;
  createdAt: number;
}

interface PendingMessageContextValue {
  pending: PendingMessage | null;
  setPending: (pending: PendingMessage) => void;
  clearPending: () => void;
  /**
   * Consume the pending message for `taskId` exactly once.
   * Returns the message if it matches and is fresh; null otherwise.
   * Clears internally on a successful match; caller does not need to clear.
   */
  consumeFor: (taskId: string) => SendMessageParams | null;
}

const Ctx = createContext<PendingMessageContextValue | null>(null);

export function PendingMessageProvider({ children }: { children: ReactNode }) {
  const [pending, setPendingState] = useState<PendingMessage | null>(null);
  const consumedRef = useRef<string | null>(null);

  const setPending = (p: PendingMessage) => {
    consumedRef.current = null;
    setPendingState(p);
  };

  const clearPending = () => {
    consumedRef.current = null;
    setPendingState(null);
  };

  const consumeFor = (taskId: string): SendMessageParams | null => {
    if (!pending) return null;
    if (pending.taskId !== taskId) return null;
    if (consumedRef.current === taskId) return null;

    const age = Date.now() - pending.createdAt;
    if (age >= PENDING_MESSAGE_TTL_MS) {
      consumedRef.current = taskId;
      setPendingState(null);
      return null;
    }

    consumedRef.current = taskId;
    const msg = pending.message;
    setPendingState(null);
    return msg;
  };

  const value: PendingMessageContextValue = {
    pending,
    setPending,
    clearPending,
    consumeFor,
  };

  return <Ctx value={value}>{children}</Ctx>;
}

export function usePendingMessage(): PendingMessageContextValue {
  const ctx = use(Ctx);
  if (!ctx) {
    throw new Error(
      "usePendingMessage must be used within PendingMessageProvider",
    );
  }
  return ctx;
}

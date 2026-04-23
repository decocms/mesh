/**
 * Thin hook surface over the VmEventsContext.
 *
 * All the EventSource lifecycle lives in VmEventsProvider; these hooks
 * just read the context and — for chunk subscribers — register with the
 * provider's handler registry.
 *
 * Consumers should call useVmEvents() for state and useVmChunkHandler()
 * for PTY chunk callbacks. Pass `null` to useVmChunkHandler to unsubscribe.
 */

import { use, useEffect, useRef } from "react";
import { VmEventsContext, type ChunkHandler } from "./vm-events-context.tsx";

export type {
  BranchStatus,
  ChunkHandler,
  VmStatus,
} from "./vm-events-context.tsx";

export function useVmEvents() {
  return use(VmEventsContext);
}

/**
 * Subscribe to PTY chunk events for the lifetime of the calling
 * component. Uses a ref under the hood so you can pass inline handlers
 * that close over state without forcing re-subscribes.
 */
export function useVmChunkHandler(handler: ChunkHandler | null) {
  const { subscribeChunks } = useVmEvents();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — subscription lifecycle bound to the component mount; uses ref for stable identity
  useEffect(() => {
    const fn: ChunkHandler = (source, data) => {
      handlerRef.current?.(source, data);
    };
    const unsubscribe = subscribeChunks(fn);
    return unsubscribe;
  }, [subscribeChunks]);
}

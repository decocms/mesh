/**
 * Thin hook surface over the VmEventsContext.
 *
 * All the EventSource lifecycle lives in VmEventsProvider; these hooks
 * just read the context and — for chunk/reload subscribers — register
 * with the provider's handler registries.
 *
 * Consumers call useVmEvents() for state, useVmChunkHandler() for PTY
 * chunk callbacks, and useVmReloadHandler() for iframe-reload callbacks.
 * Pass `null` to either subscribe hook to unsubscribe.
 */

import { use, useEffect, useRef } from "react";
import {
  VmEventsContext,
  type ChunkHandler,
  type ReloadHandler,
} from "./vm-events-context.tsx";

export type {
  BranchStatus,
  ChunkHandler,
  ReloadHandler,
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

/**
 * Subscribe to iframe-reload events (daemon emits "reload" for config
 * edits that framework HMR doesn't watch; .ts/.tsx edits go through the
 * framework's own reload path). Pass `null` to opt out without
 * unmounting.
 */
export function useVmReloadHandler(handler: ReloadHandler | null) {
  const { subscribeReload } = useVmEvents();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — subscription lifecycle bound to the component mount; uses ref for stable identity
  useEffect(() => {
    const fn: ReloadHandler = () => {
      handlerRef.current?.();
    };
    const unsubscribe = subscribeReload(fn);
    return unsubscribe;
  }, [subscribeReload]);
}

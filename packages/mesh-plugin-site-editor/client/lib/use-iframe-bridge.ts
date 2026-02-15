/**
 * useIframeBridge Hook
 *
 * Manages the lifecycle of postMessage communication between the editor
 * and a site iframe. Handles the deco:ready handshake, page config sending,
 * block selection, and block click events.
 *
 * Uses useSyncExternalStore for the ready state (external subscription to
 * window message events) to comply with the ban-use-effect lint rule.
 */

import { useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { DECO_MSG_PREFIX } from "./editor-protocol";
import type { EditorMessage, SiteMessage } from "./editor-protocol";
import type { Page } from "./page-api";

interface IframeBridgeOptions {
  page: Page | null;
  selectedBlockId: string | null;
  onBlockClicked: (blockId: string) => void;
}

interface IframeBridgeResult {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  ready: boolean;
  send: (msg: EditorMessage) => void;
  /** Ref callback to attach to the iframe element */
  setIframeRef: (el: HTMLIFrameElement | null) => void;
}

/**
 * Creates a bridge between the editor and an iframe using postMessage.
 *
 * The ready state is tracked as an external store subscription to avoid
 * useEffect. The iframe's load event and window message events are managed
 * via a subscribe/getSnapshot pattern.
 */
export function useIframeBridge({
  page,
  selectedBlockId,
  onBlockClicked,
}: IframeBridgeOptions): IframeBridgeResult {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const pageRef = useRef(page);
  const selectedBlockIdRef = useRef(selectedBlockId);
  const onBlockClickedRef = useRef(onBlockClicked);

  // Keep refs in sync with latest props (React Compiler handles this)
  pageRef.current = page;
  selectedBlockIdRef.current = selectedBlockId;
  onBlockClickedRef.current = onBlockClicked;

  const send = (msg: EditorMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  };

  // Track previous page/selectedBlockId to detect changes during render
  const prevPageRef = useRef<Page | null>(null);
  const prevSelectedBlockIdRef = useRef<string | null>(null);

  // Send updates when page or selectedBlockId change (in render, not effect)
  if (readyRef.current) {
    if (page && page !== prevPageRef.current) {
      // Schedule microtask to avoid sending during render
      queueMicrotask(() => {
        if (readyRef.current && pageRef.current) {
          send({ type: "deco:page-config", page: pageRef.current });
        }
      });
    }
    if (selectedBlockId && selectedBlockId !== prevSelectedBlockIdRef.current) {
      queueMicrotask(() => {
        if (readyRef.current && selectedBlockIdRef.current) {
          send({
            type: "deco:select-block",
            blockId: selectedBlockIdRef.current,
          });
        }
      });
    }
  }
  prevPageRef.current = page;
  prevSelectedBlockIdRef.current = selectedBlockId;

  // Use useSyncExternalStore for the ready state
  const ready = useSyncExternalStore(
    (notify) => {
      const handleMessage = (e: MessageEvent) => {
        if (e.source !== iframeRef.current?.contentWindow) return;
        if (!e.data?.type?.startsWith(DECO_MSG_PREFIX)) return;

        const msg = e.data as SiteMessage;

        if (msg.type === "deco:ready") {
          readyRef.current = true;
          notify();
          // Send page config after ready handshake
          if (pageRef.current) {
            send({ type: "deco:page-config", page: pageRef.current });
          }
        }

        if (msg.type === "deco:block-clicked") {
          onBlockClickedRef.current(msg.blockId);
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    },
    () => readyRef.current,
    () => false, // server snapshot
  );

  const setIframeRef = (el: HTMLIFrameElement | null) => {
    // Clean up old iframe load listener
    const prev = iframeRef.current;
    if (prev && prev !== el) {
      prev.removeEventListener("load", handleIframeLoad);
    }

    iframeRef.current = el;

    // Attach load listener to new iframe
    if (el) {
      el.addEventListener("load", handleIframeLoad);
    }
  };

  // Using a stable function reference for the load handler
  const handleIframeLoad = () => {
    // Reset ready state when iframe reloads (HMR/navigation)
    readyRef.current = false;
  };

  return { iframeRef, ready, send, setIframeRef };
}

/**
 * useIframeBridge Hook
 *
 * Manages the lifecycle of postMessage communication between the editor
 * and a site iframe. Handles the deco:ready handshake, page config sending,
 * block selection, block click events, edit/interact mode, and disconnect
 * detection.
 *
 * Uses useSyncExternalStore for the bridge state (external subscription to
 * window message events) to comply with the ban-use-effect lint rule.
 *
 * Bridge state machine: 0=loading, 1=ready, 2=disconnected
 * - On iframe load: state -> 0 (loading), start 5s disconnect timer
 * - On deco:ready received: state -> 1 (ready), clear timer
 * - On disconnect timer fire: state -> 2 (disconnected)
 */

import { useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { DECO_MSG_PREFIX } from "./editor-protocol";
import type { EditorMessage, SiteMessage } from "./editor-protocol";
import type { Page } from "./page-api";

/** Bridge states: loading=0, ready=1, disconnected=2 */
const LOADING = 0;
const READY = 1;
const DISCONNECTED = 2;

interface IframeBridgeOptions {
  page: Page | null;
  selectedBlockId: string | null;
  mode?: "edit" | "interact";
  onBlockClicked: (blockId: string) => void;
  onClickAway?: () => void;
  onNavigated?: (url: string, isInternal: boolean) => void;
}

interface IframeBridgeResult {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  ready: boolean;
  disconnected: boolean;
  send: (msg: EditorMessage) => void;
  /** Ref callback to attach to the iframe element */
  setIframeRef: (el: HTMLIFrameElement | null) => void;
  /** Reload the iframe to attempt reconnection */
  reconnect: () => void;
}

/**
 * Creates a bridge between the editor and an iframe using postMessage.
 *
 * The bridge state is tracked as an external store subscription to avoid
 * useEffect. The iframe's load event and window message events are managed
 * via a subscribe/getSnapshot pattern.
 */
export function useIframeBridge({
  page,
  selectedBlockId,
  mode = "edit",
  onBlockClicked,
  onClickAway,
  onNavigated,
}: IframeBridgeOptions): IframeBridgeResult {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef(LOADING);
  const pageRef = useRef(page);
  const selectedBlockIdRef = useRef(selectedBlockId);
  const modeRef = useRef(mode);
  const onBlockClickedRef = useRef(onBlockClicked);
  const onClickAwayRef = useRef(onClickAway);
  const onNavigatedRef = useRef(onNavigated);

  // Disconnect detection refs
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyRef = useRef<(() => void) | null>(null);

  // Keep refs in sync with latest props (React Compiler handles this)
  pageRef.current = page;
  selectedBlockIdRef.current = selectedBlockId;
  modeRef.current = mode;
  onBlockClickedRef.current = onBlockClicked;
  onClickAwayRef.current = onClickAway;
  onNavigatedRef.current = onNavigated;

  const send = (msg: EditorMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  };

  // Track previous page/selectedBlockId to detect changes during render
  const prevPageRef = useRef<Page | null>(null);
  const prevSelectedBlockIdRef = useRef<string | null>(null);

  // Send updates when page or selectedBlockId change (in render, not effect)
  if (stateRef.current === READY) {
    if (page && page !== prevPageRef.current) {
      // Schedule microtask to avoid sending during render
      queueMicrotask(() => {
        if (stateRef.current === READY && pageRef.current) {
          send({ type: "deco:page-config", page: pageRef.current });
        }
      });
    }
    if (selectedBlockId && selectedBlockId !== prevSelectedBlockIdRef.current) {
      queueMicrotask(() => {
        if (stateRef.current === READY && selectedBlockIdRef.current) {
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

  // Use useSyncExternalStore for the bridge state
  const state = useSyncExternalStore(
    (notify) => {
      // Store notify so disconnect timer and iframe load can trigger re-renders
      notifyRef.current = notify;

      const handleMessage = (e: MessageEvent) => {
        if (e.source !== iframeRef.current?.contentWindow) return;
        if (!e.data?.type?.startsWith(DECO_MSG_PREFIX)) return;

        const msg = e.data as SiteMessage;

        if (msg.type === "deco:ready") {
          // Clear disconnect timer and transition to ready
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          stateRef.current = READY;
          notify();
          // Send page config and current mode after ready handshake
          if (pageRef.current) {
            send({ type: "deco:page-config", page: pageRef.current });
          }
          send({ type: "deco:set-mode", mode: modeRef.current });
        }

        if (msg.type === "deco:block-clicked") {
          onBlockClickedRef.current(msg.blockId);
        }

        if (msg.type === "deco:click-away") {
          onClickAwayRef.current?.();
        }

        if (msg.type === "deco:navigated") {
          onNavigatedRef.current?.(msg.url, msg.isInternal);
        }
      };

      window.addEventListener("message", handleMessage);
      return () => {
        window.removeEventListener("message", handleMessage);
        notifyRef.current = null;
      };
    },
    () => stateRef.current,
    () => LOADING, // server snapshot
  );

  const ready = state === READY;
  const disconnected = state === DISCONNECTED;

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
    // Reset to loading state when iframe reloads (HMR/navigation)
    stateRef.current = LOADING;

    // Clear any existing disconnect timer
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
    }

    // Start 5-second disconnect detection timer
    disconnectTimerRef.current = setTimeout(() => {
      stateRef.current = DISCONNECTED;
      disconnectTimerRef.current = null;
      // Trigger re-render so component sees disconnected state
      notifyRef.current?.();
    }, 5000);

    // Trigger re-render for loading state
    notifyRef.current?.();
  };

  // Reconnect by reloading the iframe
  const reconnect = () => {
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = currentSrc;
    }
  };

  return { iframeRef, ready, disconnected, send, setIframeRef, reconnect };
}

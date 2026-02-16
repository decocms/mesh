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
 * - On deco:ready received: state -> 1 (ready), clear timer, start heartbeat
 * - On heartbeat timeout: state -> 2 (disconnected)
 */

import { useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { DECO_MSG_PREFIX } from "./editor-protocol";
import type { EditorMessage, SiteMessage } from "./editor-protocol";
import type { Page } from "./page-api";
import { injectBridge } from "./inject-bridge";

/** Bridge states: loading=0, ready=1, disconnected=2 */
const LOADING = 0;
const READY = 1;
const DISCONNECTED = 2;

/** Heartbeat interval (ms) — how often we ping the iframe */
const HEARTBEAT_INTERVAL = 10_000;
/** Heartbeat timeout (ms) — how long we wait for a pong before marking disconnected */
const HEARTBEAT_TIMEOUT = 5_000;

export interface HoverRect {
  blockId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

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
  hoverRect: HoverRect | null;
  send: (msg: EditorMessage) => void;
  /** Ref callback to attach to the iframe element */
  setIframeRef: (el: HTMLIFrameElement | null) => void;
  /** Reload the iframe to attempt reconnection */
  reconnect: () => void;
  /** Clear the hover overlay */
  clearHover: () => void;
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

  // Hover rect tracking
  const hoverRectRef = useRef<HoverRect | null>(null);
  const hoverNotifyRef = useRef<(() => void) | null>(null);

  // Disconnect detection refs — managed outside subscribe to survive re-subscriptions
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyRef = useRef<(() => void) | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  // Track last message timestamp for heartbeat
  const lastMessageTimeRef = useRef(0);

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

  // Track previous page/selectedBlockId to detect changes during render.
  // Use serialized JSON to compare by value (localPage is a new object each render).
  const prevPageJsonRef = useRef<string>("");
  const prevSelectedBlockIdRef = useRef<string | null>(null);

  // Send updates when page or selectedBlockId change (in render, not effect)
  const pageJson = page ? JSON.stringify(page) : "";
  if (stateRef.current === READY) {
    if (page && pageJson !== prevPageJsonRef.current) {
      // Schedule microtask to avoid sending during render
      queueMicrotask(() => {
        if (stateRef.current === READY && pageRef.current) {
          send({ type: "deco:page-config", page: pageRef.current });
        }
      });
    }
    if (selectedBlockId !== prevSelectedBlockIdRef.current) {
      if (selectedBlockId) {
        queueMicrotask(() => {
          if (stateRef.current === READY && selectedBlockIdRef.current) {
            send({
              type: "deco:select-block",
              blockId: selectedBlockIdRef.current,
            });
          }
        });
      } else {
        // Selection cleared — tell iframe to hide overlay and clear editor hover
        hoverRectRef.current = null;
        queueMicrotask(() => {
          hoverNotifyRef.current?.();
          if (stateRef.current === READY) {
            send({ type: "deco:deselect" });
          }
        });
      }
    }
  }
  prevPageJsonRef.current = pageJson;
  prevSelectedBlockIdRef.current = selectedBlockId;

  // Heartbeat management — timestamp-based, no per-ping timeouts
  // Every HEARTBEAT_INTERVAL, we ping and check when we last heard from the iframe.
  // If more than HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT since last message, disconnect.
  const startHeartbeat = () => {
    stopHeartbeat();
    lastMessageTimeRef.current = Date.now();
    heartbeatIntervalRef.current = setInterval(() => {
      if (stateRef.current !== READY) {
        stopHeartbeat();
        return;
      }
      send({ type: "deco:ping" });
      const elapsed = Date.now() - lastMessageTimeRef.current;
      if (elapsed > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
        // Haven't heard from iframe in too long — mark disconnected
        stateRef.current = DISCONNECTED;
        stopHeartbeat();
        notifyRef.current?.();
      }
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // Use useSyncExternalStore for the bridge state
  const state = useSyncExternalStore(
    (notify) => {
      // Store notify so disconnect timer, heartbeat, and iframe load can trigger re-renders
      notifyRef.current = notify;

      const handleMessage = (e: MessageEvent) => {
        if (e.source !== iframeRef.current?.contentWindow) return;
        if (!e.data?.type?.startsWith(DECO_MSG_PREFIX)) return;

        // Any message from the iframe proves it's alive
        lastMessageTimeRef.current = Date.now();

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
          // Start heartbeat (safe to call even if already running — startHeartbeat stops first)
          startHeartbeat();
        }

        if (msg.type === "deco:block-hover") {
          if (msg.blockId && msg.rect) {
            hoverRectRef.current = {
              blockId: msg.blockId,
              top: msg.rect.top,
              left: msg.rect.left,
              width: msg.rect.width,
              height: msg.rect.height,
            };
          } else {
            hoverRectRef.current = null;
          }
          hoverNotifyRef.current?.();
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
        // Don't stop heartbeat on unsubscribe — it's managed via refs
        // and will be cleaned up by startHeartbeat/stopHeartbeat calls
        notifyRef.current = null;
      };
    },
    () => stateRef.current,
    () => LOADING, // server snapshot
  );

  const ready = state === READY;
  const disconnected = state === DISCONNECTED;

  // Separate store for hover rect (updates frequently, independent of bridge state)
  const hoverRect = useSyncExternalStore(
    (notify) => {
      hoverNotifyRef.current = notify;
      return () => {
        hoverNotifyRef.current = null;
      };
    },
    () => hoverRectRef.current,
    () => null,
  );

  // Clear hover when mode is not edit
  if (mode !== "edit" && hoverRectRef.current !== null) {
    hoverRectRef.current = null;
    queueMicrotask(() => hoverNotifyRef.current?.());
  }

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
    // If we're already READY (bridge script ran before load event), skip reset.
    // The bridge <script> executes during HTML parsing, which is before the
    // iframe's load event fires (load waits for all sub-resources). So the
    // deco:ready handshake may already be complete by now.
    if (stateRef.current === READY) return;

    // Reset to loading state when iframe reloads (HMR/navigation)
    stateRef.current = LOADING;
    stopHeartbeat();

    // Clear any existing disconnect timer
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
    }

    // Inject the editor bridge into the iframe (best-effort, same-origin only)
    if (iframeRef.current) {
      injectBridge(iframeRef.current);
    }

    // Start 5-second disconnect detection timer
    disconnectTimerRef.current = setTimeout(() => {
      if (stateRef.current === READY) return; // Bridge connected in the meantime
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

  const clearHover = () => {
    if (hoverRectRef.current !== null) {
      hoverRectRef.current = null;
      hoverNotifyRef.current?.();
    }
  };

  return {
    iframeRef,
    ready,
    disconnected,
    hoverRect,
    send,
    setIframeRef,
    reconnect,
    clearHover,
  };
}

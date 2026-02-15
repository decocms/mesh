/**
 * useEditorMessages Hook
 *
 * Provides typed send/subscribe for the editor-iframe postMessage protocol.
 * Filters messages by source (iframe contentWindow) and prefix ("deco:").
 */

import type { RefObject } from "react";
import type { EditorMessage, SiteMessage } from "./editor-protocol";
import { DECO_MSG_PREFIX } from "./editor-protocol";

interface UseEditorMessagesResult {
  /** Send a typed message to the iframe */
  send: (msg: EditorMessage) => void;
  /** Subscribe to typed messages from the iframe. Returns cleanup function. */
  subscribe: (handler: (msg: SiteMessage) => void) => () => void;
}

/**
 * Hook for typed postMessage communication with the site iframe.
 *
 * Uses "*" as targetOrigin because the tunnel URL is cross-origin.
 * Filters incoming messages by source (iframe contentWindow) and
 * prefix ("deco:") to ignore unrelated messages.
 */
export function useEditorMessages(
  iframeRef: RefObject<HTMLIFrameElement | null>,
): UseEditorMessagesResult {
  const send = (msg: EditorMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  };

  const subscribe = (handler: (msg: SiteMessage) => void) => {
    const listener = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!e.data?.type?.startsWith(DECO_MSG_PREFIX)) return;
      handler(e.data as SiteMessage);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  };

  return { send, subscribe };
}

/**
 * useVmEvents — SSE hook for the VM daemon.
 *
 * Connects to the daemon's /_daemon/events endpoint running inside the VM
 * and streams log lines and upstream status back to React state.
 *
 * Built on createSSESubscription for ref-counted connections and auto-reconnect.
 */

import { useState, useRef, useEffect } from "react";
import { createSSESubscription } from "./create-sse-subscription";

export interface VmStatus {
  ready: boolean;
  htmlSupport: boolean;
}

const MAX_LOG_LINES = 5000;

const daemonSSE = createSSESubscription({
  buildUrl: (previewUrl) => `${previewUrl}/_daemon/events`,
  eventTypes: ["log", "status"],
});

/**
 * After MAX_DISCONNECT_MS without receiving any event, the VM is considered
 * suspended. This replaces the old heartbeat-based suspension detection.
 */
const MAX_DISCONNECT_MS = 45_000;

export function useVmEvents(previewUrl: string | null) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<VmStatus>({
    ready: false,
    htmlSupport: false,
  });
  const [suspended, setSuspended] = useState(false);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — SSE subscription lifecycle requires cleanup on unmount; createSSESubscription returns an unsubscribe function that must be called in an effect cleanup
  useEffect(() => {
    if (!previewUrl) return;

    // Reset state for new connection
    setLogs([]);
    setStatus({ ready: false, htmlSupport: false });
    setSuspended(false);

    const unsubscribe = daemonSSE.subscribe(previewUrl, (e: MessageEvent) => {
      // Any event received means we're connected — clear suspension timer
      if (disconnectTimer.current) {
        clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
      setSuspended(false);

      // Restart the disconnect timer
      disconnectTimer.current = setTimeout(() => {
        setSuspended(true);
      }, MAX_DISCONNECT_MS);

      try {
        const data = JSON.parse(e.data);

        if (e.type === "log" && Array.isArray(data.lines)) {
          setLogs((prev) => {
            const next = [...prev, ...data.lines];
            return next.length > MAX_LOG_LINES
              ? next.slice(next.length - MAX_LOG_LINES)
              : next;
          });
        } else if (e.type === "status") {
          setStatus({
            ready: Boolean(data.ready),
            htmlSupport: Boolean(data.htmlSupport),
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    // Start a disconnect timer — if no events arrive within MAX_DISCONNECT_MS,
    // assume the VM is suspended. The timer resets on each received event.
    disconnectTimer.current = setTimeout(() => {
      setSuspended(true);
    }, MAX_DISCONNECT_MS);

    return () => {
      unsubscribe();
      if (disconnectTimer.current) {
        clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
    };
  }, [previewUrl]);

  return { logs, status, suspended };
}

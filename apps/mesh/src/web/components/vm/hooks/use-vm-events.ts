/**
 * useVmEvents — SSE hook for the VM daemon.
 *
 * Connects to the daemon's /_daemon/events endpoint running inside the VM
 * and streams raw PTY chunks and upstream status back to React.
 *
 * Built on createSSESubscription for ref-counted connections and auto-reconnect.
 */

import { useState, useRef, useEffect } from "react";
import { createSSESubscription } from "../../../hooks/create-sse-subscription";

export interface VmStatus {
  ready: boolean;
  htmlSupport: boolean;
}

export type ChunkHandler = (
  source: "install" | "dev" | "daemon",
  data: string,
) => void;

const BUFFER_BYTES = 16384;

class ChunkBuffer {
  private data = "";
  append(chunk: string) {
    this.data += chunk;
    if (this.data.length > BUFFER_BYTES) {
      this.data = this.data.slice(this.data.length - BUFFER_BYTES);
    }
  }
  get() {
    return this.data;
  }
  clear() {
    this.data = "";
  }
}

const daemonSSE = createSSESubscription({
  buildUrl: (previewUrl) => `${previewUrl}/_daemon/events`,
  eventTypes: ["log", "status"],
});

/**
 * After MAX_DISCONNECT_MS without receiving any event, the VM is considered
 * suspended. This replaces the old heartbeat-based suspension detection.
 */
const MAX_DISCONNECT_MS = 45_000;

export function useVmEvents(
  previewUrl: string | null,
  onChunk: ChunkHandler | null,
) {
  const [status, setStatus] = useState<VmStatus>({
    ready: false,
    htmlSupport: false,
  });
  const [suspended, setSuspended] = useState(false);
  const [hasInstallData, setHasInstallData] = useState(false);
  const [hasDevData, setHasDevData] = useState(false);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const installBuffer = useRef(new ChunkBuffer());
  const devBuffer = useRef(new ChunkBuffer());
  const daemonBuffer = useRef(new ChunkBuffer());

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — SSE subscription lifecycle requires cleanup on unmount; createSSESubscription returns an unsubscribe function that must be called in an effect cleanup
  useEffect(() => {
    if (!previewUrl) return;

    // Reset state for new connection
    setStatus({ ready: false, htmlSupport: false });
    setSuspended(false);
    setHasInstallData(false);
    setHasDevData(false);
    installBuffer.current.clear();
    devBuffer.current.clear();
    daemonBuffer.current.clear();

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

        if (e.type === "log" && typeof data.data === "string") {
          const source = data.source as "install" | "dev" | "daemon";
          if (source === "install") {
            setHasInstallData(true);
            installBuffer.current.append(data.data);
          }
          if (source === "dev") {
            setHasDevData(true);
            devBuffer.current.append(data.data);
          }
          if (source === "daemon") {
            daemonBuffer.current.append(data.data);
          }
          onChunkRef.current?.(source, data.data);
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

  return {
    status,
    suspended,
    hasInstallData,
    hasDevData,
    getInstallBuffer: () => installBuffer.current.get(),
    getDevBuffer: () => devBuffer.current.get(),
    getDaemonBuffer: () => daemonBuffer.current.get(),
  };
}

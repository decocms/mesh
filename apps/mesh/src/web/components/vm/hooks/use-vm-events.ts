/**
 * useVmEvents — SSE hook for the VM daemon.
 *
 * Connects to the daemon's /_decopilot_vm/events endpoint running inside the VM
 * and streams raw PTY chunks, upstream status, discovered scripts, and
 * active process state back to React.
 *
 * Uses a direct EventSource per effect invocation so that each mount gets a
 * fresh SSE connection and the daemon replays scripts, logs, and active
 * processes on connect.
 */

import { useState, useRef, useEffect } from "react";

export interface VmStatus {
  ready: boolean;
  htmlSupport: boolean;
}

export type ChunkHandler = (source: string, data: string) => void;

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

const MAX_DISCONNECT_MS = 45_000;

/** Base reconnect delay in ms */
const BASE_RECONNECT_DELAY_MS = 1_000;
/** Max reconnect delay in ms */
const MAX_RECONNECT_DELAY_MS = 30_000;

const EVENT_TYPES = ["log", "status", "scripts", "processes"] as const;

export function useVmEvents(
  previewUrl: string | null,
  onChunk: ChunkHandler | null,
) {
  const [status, setStatus] = useState<VmStatus>({
    ready: false,
    htmlSupport: false,
  });
  const [suspended, setSuspended] = useState(false);
  const [scripts, setScripts] = useState<string[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const buffers = useRef(new Map<string, ChunkBuffer>());

  const getOrCreateBuffer = (source: string) => {
    let buf = buffers.current.get(source);
    if (!buf) {
      buf = new ChunkBuffer();
      buffers.current.set(source, buf);
    }
    return buf;
  };

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — SSE subscription lifecycle requires cleanup on unmount; direct EventSource with reconnect logic
  useEffect(() => {
    if (!previewUrl) return;

    // Reset state for new connection
    setStatus({ ready: false, htmlSupport: false });
    setSuspended(false);
    setScripts([]);
    setActiveProcesses([]);
    buffers.current.clear();

    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const handler = (e: MessageEvent) => {
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
          const source = data.source as string;
          getOrCreateBuffer(source).append(data.data);
          onChunkRef.current?.(source, data.data);
        } else if (e.type === "status") {
          setStatus({
            ready: Boolean(data.ready),
            htmlSupport: Boolean(data.htmlSupport),
          });
        } else if (e.type === "scripts") {
          setScripts(data.scripts ?? []);
        } else if (e.type === "processes") {
          setActiveProcesses(data.active ?? []);
        }
      } catch {
        // ignore parse errors
      }
    };

    function connect() {
      if (disposed) return;

      es = new EventSource(`${previewUrl}/_decopilot_vm/events`);

      es.onopen = () => {
        reconnectAttempt = 0;
      };

      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) {
          scheduleReconnect();
        }
      };

      for (const type of EVENT_TYPES) {
        es.addEventListener(type, handler);
      }
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimer) return;

      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectAttempt++;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (disposed) return;
        es?.close();
        connect();
      }, delay);
    }

    connect();

    disconnectTimer.current = setTimeout(() => {
      setSuspended(true);
    }, MAX_DISCONNECT_MS);

    return () => {
      disposed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (disconnectTimer.current) {
        clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
    };
  }, [previewUrl]);

  return {
    status,
    suspended,
    scripts,
    activeProcesses,
    getBuffer: (source: string) => buffers.current.get(source)?.get() ?? "",
    hasData: (source: string) =>
      (buffers.current.get(source)?.get().length ?? 0) > 0,
  };
}

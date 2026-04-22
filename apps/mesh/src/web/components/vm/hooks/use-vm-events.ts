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

/**
 * Time the connection must stay down before we declare the VM "suspended".
 * Previously we inferred suspension from SSE event silence, but a ready-state
 * dev server legitimately has nothing to emit — that fired false positives
 * while the user was actively viewing. The daemon ships an SSE comment every
 * 15s which keeps TCP warm and makes `EventSource.onerror` fire promptly when
 * the VM actually goes away, so we key off connection state instead.
 */
const SUSPENDED_AFTER_ERROR_MS = 60_000;

/** Base reconnect delay in ms */
const BASE_RECONNECT_DELAY_MS = 1_000;
/** Max reconnect delay in ms */
const MAX_RECONNECT_DELAY_MS = 30_000;

const EVENT_TYPES = [
  "log",
  "status",
  "scripts",
  "processes",
  "reload",
] as const;

export function useVmEvents(
  sseUrl: string | null,
  onChunk: ChunkHandler | null,
  onReload?: (() => void) | null,
) {
  const [status, setStatus] = useState<VmStatus>({
    ready: false,
    htmlSupport: false,
  });
  const [suspended, setSuspended] = useState(false);
  const [scripts, setScripts] = useState<string[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  // Bumped whenever log chunks land so consumers reading `getBuffer` /
  // `hasData` during render see fresh data — buffer mutation alone doesn't
  // trigger a re-render.
  const [, setLogTick] = useState(0);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;
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
    if (!sseUrl) return;

    // Reset state for new connection
    setStatus({ ready: false, htmlSupport: false });
    setSuspended(false);
    setScripts([]);
    setActiveProcesses([]);
    buffers.current.clear();

    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let suspendTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const clearSuspendTimer = () => {
      if (suspendTimer) {
        clearTimeout(suspendTimer);
        suspendTimer = null;
      }
    };

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        if (e.type === "log" && typeof data.data === "string") {
          const source = data.source as string;
          // xterm.js treats bare `\n` as "cursor down, keep column" — the
          // daemon forwards raw `\n` from child stdout, so without this each
          // line would start wherever the previous one ended.
          const normalized = data.data.replace(/\r?\n/g, "\r\n");
          getOrCreateBuffer(source).append(normalized);
          onChunkRef.current?.(source, normalized);
          setLogTick((t) => t + 1);
        } else if (e.type === "status") {
          setStatus({
            ready: Boolean(data.ready),
            htmlSupport: Boolean(data.htmlSupport),
          });
        } else if (e.type === "scripts") {
          setScripts(data.scripts ?? []);
        } else if (e.type === "processes") {
          setActiveProcesses(data.active ?? []);
        } else if (e.type === "reload") {
          onReloadRef.current?.();
        }
      } catch {
        // ignore parse errors
      }
    };

    function connect() {
      if (disposed || !sseUrl) return;

      es = new EventSource(sseUrl);

      es.onopen = () => {
        reconnectAttempt = 0;
        clearSuspendTimer();
        setSuspended(false);
      };

      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) {
          // Start (or keep running) the suspend timer only while we're
          // actively disconnected. If we reconnect before it fires, the next
          // onopen clears it.
          if (!suspendTimer) {
            suspendTimer = setTimeout(() => {
              setSuspended(true);
            }, SUSPENDED_AFTER_ERROR_MS);
          }
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

    return () => {
      disposed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearSuspendTimer();
    };
  }, [sseUrl]);

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

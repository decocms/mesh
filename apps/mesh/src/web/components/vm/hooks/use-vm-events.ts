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

export interface BranchStatus {
  branch: string;
  base: string;
  workingTreeDirty: boolean;
  unpushed: number;
  aheadOfBase: number;
  behindBase: number;
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
  "branch-status",
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
  // True when the daemon endpoint reports 404 — i.e. the handle no longer
  // exists in sandbox_runner_state. The vmMap entry is stale and callers
  // should reprovision via VM_START rather than retry forever.
  const [notFound, setNotFound] = useState(false);
  const [scripts, setScripts] = useState<string[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  // Bumped whenever log chunks land so consumers reading `getBuffer` /
  // `hasData` during render see fresh data — buffer mutation alone doesn't
  // trigger a re-render.
  const [, setLogTick] = useState(0);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
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
    setNotFound(false);
    setScripts([]);
    setActiveProcesses([]);
    setBranchStatus(null);
    buffers.current.clear();

    let disposed = false;
    let hasProbed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let suspendTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    const probeAbort = new AbortController();

    // One-shot status probe. EventSource's onerror doesn't expose the HTTP
    // status, so we fetch the same URL once to distinguish "sandbox deleted"
    // (404 → permanent until sseUrl changes) from a transient disconnect.
    async function probeMissing(): Promise<boolean> {
      if (!sseUrl) return false;
      try {
        const res = await fetch(sseUrl, {
          method: "GET",
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
          signal: probeAbort.signal,
        });
        // We only care about the status code; cancel the stream immediately.
        if (res.body) {
          try {
            await res.body.cancel();
          } catch {
            /* ignore */
          }
        }
        return res.status === 404;
      } catch {
        return false;
      }
    }

    const enterSuspendTimerIfIdle = () => {
      if (!suspendTimer) {
        suspendTimer = setTimeout(() => {
          setSuspended(true);
        }, SUSPENDED_AFTER_ERROR_MS);
      }
    };

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
        } else if (e.type === "branch-status") {
          setBranchStatus({
            branch: String(data.branch ?? ""),
            base: String(data.base ?? "main"),
            workingTreeDirty: Boolean(data.workingTreeDirty),
            unpushed: Number(data.unpushed ?? 0),
            aheadOfBase: Number(data.aheadOfBase ?? 0),
            behindBase: Number(data.behindBase ?? 0),
          });
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
        if (es?.readyState !== EventSource.CLOSED) return;
        // Start (or keep running) the suspend timer only while we're
        // actively disconnected. If we reconnect before it fires, the next
        // onopen clears it.
        enterSuspendTimerIfIdle();
        if (hasProbed) {
          scheduleReconnect();
          return;
        }
        hasProbed = true;
        probeMissing().then((missing) => {
          if (disposed) return;
          if (missing) {
            // Sandbox is gone — stop reconnecting and surface the signal so
            // the caller can reprovision via VM_START. A fresh entry in
            // vmMap changes sseUrl, which remounts this effect.
            setNotFound(true);
            return;
          }
          scheduleReconnect();
        });
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
      probeAbort.abort();
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearSuspendTimer();
    };
  }, [sseUrl]);

  return {
    status,
    suspended,
    notFound,
    scripts,
    activeProcesses,
    branchStatus,
    getBuffer: (source: string) => buffers.current.get(source)?.get() ?? "",
    hasData: (source: string) =>
      (buffers.current.get(source)?.get().length ?? 0) > 0,
  };
}

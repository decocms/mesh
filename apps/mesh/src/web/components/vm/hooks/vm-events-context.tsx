/**
 * Single SSE connection to the VM daemon, fanned out via context — one
 * EventSource instead of per-consumer (which would hit MAX_SSE_CLIENTS).
 * daemonBaseUrl: docker goes through `/api/sandbox/<vmId>/_daemon` (bearer
 * stays server-side); freestyle hits the VM's own domain directly. Provider
 * appends `/_decopilot_vm/events`.
 */

import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
  /** HEAD sha (falls back to origin/<branch>). Empty if the daemon couldn't compute it. */
  headSha: string;
}

export type ChunkHandler = (source: string, data: string) => void;
export type ReloadHandler = () => void;

export interface VmEventsValue {
  status: VmStatus;
  suspended: boolean;
  /** 404 on daemon endpoint = handle gone; reprovision via VM_START. Cleared on daemonBaseUrl change. */
  notFound: boolean;
  scripts: string[];
  activeProcesses: string[];
  branchStatus: BranchStatus | null;
  getBuffer: (source: string) => string;
  hasData: (source: string) => boolean;
  subscribeChunks: (handler: ChunkHandler) => () => void;
  /** "reload" SSE fires on config edits framework HMR doesn't watch. */
  subscribeReload: (handler: ReloadHandler) => () => void;
}

const DEFAULT_VALUE: VmEventsValue = {
  status: { ready: false, htmlSupport: false },
  suspended: false,
  notFound: false,
  scripts: [],
  activeProcesses: [],
  branchStatus: null,
  getBuffer: () => "",
  hasData: () => false,
  subscribeChunks: () => () => {},
  subscribeReload: () => () => {},
};

export const VmEventsContext = createContext<VmEventsValue>(DEFAULT_VALUE);

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

// Keyed on connection state (NOT event silence) — a ready dev server has
// nothing to emit. Daemon sends a 15s SSE heartbeat to keep TCP warm so
// EventSource.onerror fires promptly when the VM actually goes away.
const SUSPENDED_AFTER_ERROR_MS = 60_000;

const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const EVENT_TYPES = [
  "log",
  "status",
  "scripts",
  "processes",
  "reload",
  "branch-status",
] as const;

export function VmEventsProvider({
  daemonBaseUrl,
  children,
}: {
  daemonBaseUrl: string | null;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<VmStatus>({
    ready: false,
    htmlSupport: false,
  });
  const [suspended, setSuspended] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [scripts, setScripts] = useState<string[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  // Bumped on log chunks so getBuffer/hasData consumers re-render; buffer mutation alone doesn't.
  const [, setLogTick] = useState(0);

  const buffers = useRef(new Map<string, ChunkBuffer>());
  const chunkHandlers = useRef(new Set<ChunkHandler>());
  const reloadHandlers = useRef(new Set<ReloadHandler>());

  const getOrCreateBuffer = (source: string) => {
    let buf = buffers.current.get(source);
    if (!buf) {
      buf = new ChunkBuffer();
      buffers.current.set(source, buf);
    }
    return buf;
  };

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — SSE subscription lifecycle requires cleanup on unmount; single EventSource with reconnect logic
  useEffect(() => {
    // Reset on daemon URL change so stale data doesn't linger across branches.
    setStatus({ ready: false, htmlSupport: false });
    setSuspended(false);
    setNotFound(false);
    setScripts([]);
    setActiveProcesses([]);
    setBranchStatus(null);
    buffers.current.clear();

    if (!daemonBaseUrl) return;

    const sseUrl = `${daemonBaseUrl}/_decopilot_vm/events`;

    let disposed = false;
    let hasProbed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let suspendTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    const probeAbort = new AbortController();

    // EventSource.onerror doesn't expose HTTP status; fetch once to distinguish
    // 404 (sandbox deleted, permanent) from a transient disconnect.
    async function probeMissing(): Promise<boolean> {
      try {
        const res = await fetch(sseUrl, {
          method: "GET",
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
          signal: probeAbort.signal,
        });
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
          // xterm.js reads bare `\n` as "cursor down, keep column" — normalize.
          const normalized = data.data.replace(/\r?\n/g, "\r\n");
          getOrCreateBuffer(source).append(normalized);
          for (const fn of chunkHandlers.current) {
            try {
              fn(source, normalized);
            } catch {
              // swallow — one broken subscriber shouldn't break others
            }
          }
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
          for (const fn of reloadHandlers.current) {
            try {
              fn();
            } catch {
              // swallow
            }
          }
        } else if (e.type === "branch-status") {
          setBranchStatus({
            branch: String(data.branch ?? ""),
            base: String(data.base ?? "main"),
            workingTreeDirty: Boolean(data.workingTreeDirty),
            unpushed: Number(data.unpushed ?? 0),
            aheadOfBase: Number(data.aheadOfBase ?? 0),
            behindBase: Number(data.behindBase ?? 0),
            headSha: String(data.headSha ?? ""),
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    function connect() {
      if (disposed) return;

      es = new EventSource(sseUrl);

      es.onopen = () => {
        reconnectAttempt = 0;
        clearSuspendTimer();
        setSuspended(false);
      };

      es.onerror = () => {
        if (es?.readyState !== EventSource.CLOSED) return;
        // Timer runs only while disconnected; onopen clears it on reconnect.
        enterSuspendTimerIfIdle();
        if (hasProbed) {
          scheduleReconnect();
          return;
        }
        hasProbed = true;
        probeMissing().then((missing) => {
          if (disposed) return;
          if (missing) {
            // Sandbox gone — stop reconnecting; caller reprovisions via VM_START,
            // which changes daemonBaseUrl and remounts this effect.
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
  }, [daemonBaseUrl]);

  const value: VmEventsValue = {
    status,
    suspended,
    notFound,
    scripts,
    activeProcesses,
    branchStatus,
    getBuffer: (source: string) => buffers.current.get(source)?.get() ?? "",
    hasData: (source: string) =>
      (buffers.current.get(source)?.get().length ?? 0) > 0,
    subscribeChunks: (handler: ChunkHandler) => {
      chunkHandlers.current.add(handler);
      return () => {
        chunkHandlers.current.delete(handler);
      };
    },
    subscribeReload: (handler: ReloadHandler) => {
      reloadHandlers.current.add(handler);
      return () => {
        reloadHandlers.current.delete(handler);
      };
    },
  };

  return <VmEventsContext value={value}>{children}</VmEventsContext>;
}

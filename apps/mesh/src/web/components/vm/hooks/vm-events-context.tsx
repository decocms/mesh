/**
 * VmEventsProvider — owns exactly one SSE connection to the VM daemon's
 * /_decopilot_vm/events endpoint and fans out to all consumers via context.
 *
 * Replaces the previous per-consumer EventSource model (preview + env +
 * header-actions each opening their own). Multiplexing prevents hitting
 * the daemon's MAX_SSE_CLIENTS cap.
 *
 * Consumers read state via useVmEvents() (argless). PTY chunk subscribers
 * register with useVmChunkHandler(fn), which adds/removes them from a
 * ref-counted Set owned by the provider.
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
  /**
   * Current HEAD sha of the local branch (falls back to origin/<branch>
   * when the remote-tracking ref exists). Empty string if the daemon
   * couldn't compute it.
   */
  headSha: string;
}

export type ChunkHandler = (source: string, data: string) => void;

export interface VmEventsValue {
  status: VmStatus;
  suspended: boolean;
  scripts: string[];
  activeProcesses: string[];
  branchStatus: BranchStatus | null;
  getBuffer: (source: string) => string;
  hasData: (source: string) => boolean;
  /**
   * Register a chunk handler. Returns an unsubscribe function.
   * Handlers are invoked synchronously on every "log" SSE event.
   */
  subscribeChunks: (handler: ChunkHandler) => () => void;
}

const DEFAULT_VALUE: VmEventsValue = {
  status: { ready: false, htmlSupport: false },
  suspended: false,
  scripts: [],
  activeProcesses: [],
  branchStatus: null,
  getBuffer: () => "",
  hasData: () => false,
  subscribeChunks: () => () => {},
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

const MAX_DISCONNECT_MS = 45_000;
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const EVENT_TYPES = [
  "log",
  "status",
  "scripts",
  "processes",
  "branch-status",
] as const;

export function VmEventsProvider({
  previewUrl,
  children,
}: {
  previewUrl: string | null;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<VmStatus>({
    ready: false,
    htmlSupport: false,
  });
  const [suspended, setSuspended] = useState(false);
  const [scripts, setScripts] = useState<string[]>([]);
  const [activeProcesses, setActiveProcesses] = useState<string[]>([]);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);

  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buffers = useRef(new Map<string, ChunkBuffer>());
  const chunkHandlers = useRef(new Set<ChunkHandler>());

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
    if (!previewUrl) {
      // Reset state when the VM goes away so stale data doesn't linger.
      setStatus({ ready: false, htmlSupport: false });
      setSuspended(false);
      setScripts([]);
      setActiveProcesses([]);
      setBranchStatus(null);
      buffers.current.clear();
      return;
    }

    // Reset state for new connection
    setStatus({ ready: false, htmlSupport: false });
    setSuspended(false);
    setScripts([]);
    setActiveProcesses([]);
    setBranchStatus(null);
    buffers.current.clear();

    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const handler = (e: MessageEvent) => {
      if (disconnectTimer.current) {
        clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
      setSuspended(false);

      disconnectTimer.current = setTimeout(() => {
        setSuspended(true);
      }, MAX_DISCONNECT_MS);

      try {
        const data = JSON.parse(e.data);

        if (e.type === "log" && typeof data.data === "string") {
          const source = data.source as string;
          getOrCreateBuffer(source).append(data.data);
          for (const fn of chunkHandlers.current) {
            try {
              fn(source, data.data);
            } catch {
              // swallow — one broken subscriber shouldn't break others
            }
          }
        } else if (e.type === "status") {
          setStatus({
            ready: Boolean(data.ready),
            htmlSupport: Boolean(data.htmlSupport),
          });
        } else if (e.type === "scripts") {
          setScripts(data.scripts ?? []);
        } else if (e.type === "processes") {
          setActiveProcesses(data.active ?? []);
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

  const value: VmEventsValue = {
    status,
    suspended,
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
  };

  return <VmEventsContext value={value}>{children}</VmEventsContext>;
}

/**
 * VmEventsProvider — owns exactly one SSE connection to the VM daemon's
 * /_decopilot_vm/events endpoint and fans out to all consumers via context.
 *
 * Replaces the previous per-consumer EventSource model (preview + env +
 * header-actions each opening their own). Multiplexing prevents hitting
 * the daemon's MAX_SSE_CLIENTS cap.
 *
 * Consumers read state via useVmEvents() (argless). PTY chunk subscribers
 * register with useVmChunkHandler(fn); iframe-reload subscribers register
 * with useVmReloadHandler(fn) — both backed by ref-counted Sets owned by
 * the provider.
 *
 * The caller passes `daemonBaseUrl` — a URL that the EventSource can hit
 * directly. Docker runners route through the mesh proxy
 * (`/api/sandbox/<vmId>/_daemon`) so the bearer token stays server-side;
 * Freestyle runners hit the VM's own domain. The provider appends
 * `/_decopilot_vm/events` to whichever base it gets.
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
export type ReloadHandler = () => void;

export interface VmEventsValue {
  status: VmStatus;
  suspended: boolean;
  /**
   * True when the daemon endpoint reports 404 — the handle no longer exists
   * in sandbox_runner_state. Callers should reprovision via VM_START rather
   * than retry forever. Cleared when daemonBaseUrl changes.
   */
  notFound: boolean;
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
  /**
   * Register a reload handler. Returns an unsubscribe function.
   * Handlers are invoked synchronously on every "reload" SSE event —
   * used for iframe refresh on config edits that framework HMR doesn't
   * watch.
   */
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

/**
 * Time the connection must stay down before we declare the VM "suspended".
 * We key off connection state (not event silence) because a ready-state
 * dev server legitimately has nothing to emit. The daemon ships an SSE
 * comment every 15s which keeps TCP warm and makes `EventSource.onerror`
 * fire promptly when the VM actually goes away.
 */
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
  // Bumped whenever log chunks land so consumers reading `getBuffer` /
  // `hasData` during render see fresh data — buffer mutation alone doesn't
  // trigger a re-render.
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
    // Reset state whenever the daemon URL changes (including clearing to null
    // when the VM goes away) so stale data doesn't linger across branches.
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

    // One-shot status probe. EventSource's onerror doesn't expose the HTTP
    // status, so we fetch the same URL once to distinguish "sandbox deleted"
    // (404 → permanent until daemonBaseUrl changes) from a transient
    // disconnect.
    async function probeMissing(): Promise<boolean> {
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
            // vmMap changes daemonBaseUrl, which remounts this effect.
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

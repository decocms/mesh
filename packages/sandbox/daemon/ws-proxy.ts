/**
 * Transparent WebSocket reverse proxy for the daemon.
 *
 * The daemon's HTTP proxy uses fetch(), which doesn't carry WebSocket
 * upgrade semantics. Without this, Vite's HMR client (and any other
 * dev-server WS) gets 502 on the upgrade, retries a few times, then
 * triggers a full-page reload as recovery — the user sees the page load
 * then immediately reload, in a loop.
 *
 * On upgrade we stash the rewritten in-pod target URL (plus the client's
 * negotiated subprotocols) in ws.data, then open the upstream WS on the
 * `open` callback and bridge frames in both directions. Subprotocols
 * (`vite-hmr`, `vite-ping`, …) are forwarded — Vite ignores connections
 * that drop them.
 */
import type { ServerWebSocket } from "bun";

/**
 * Cap on frames buffered between client upgrade and upstream WS open. The
 * upstream here is the in-pod dev server on localhost; if it isn't yet
 * listening (booting / crashed), an unbounded pending queue would let a
 * chatty client exhaust the daemon's memory.
 */
const MAX_PENDING_FRAMES = 256;

export interface WsProxyData {
  /** Full upstream URL — `ws://localhost:<devPort><path>?<search>`. */
  target: string;
  /** Subprotocols the client advertised on the upgrade request. */
  protocols: string[] | undefined;
  upstream: WebSocket | null;
  /** Frames received from the client before the upstream handshake completes. */
  pending: (string | ArrayBuffer | Uint8Array)[];
}

export interface WsUpgraderOptions {
  onClientMessage?: () => void;
}

export function makeWsUpgrader(
  getDevPort: () => number,
  opts: WsUpgraderOptions = {},
) {
  return {
    /** Build the per-connection state attached to ws.data at upgrade time. */
    upgradeData(req: Request): WsProxyData {
      const url = new URL(req.url);
      const target = `ws://localhost:${getDevPort()}${url.pathname}${url.search}`;
      const protoHeader = req.headers.get("sec-websocket-protocol");
      const protocols = protoHeader
        ? protoHeader
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      return { target, protocols, upstream: null, pending: [] };
    },

    open(ws: ServerWebSocket<WsProxyData>): void {
      const upstream = new WebSocket(ws.data.target, ws.data.protocols);
      upstream.binaryType = "arraybuffer";
      ws.data.upstream = upstream;

      upstream.addEventListener("open", () => {
        for (const frame of ws.data.pending) {
          try {
            upstream.send(frame as never);
          } catch {}
        }
        ws.data.pending.length = 0;
      });
      upstream.addEventListener("message", (e) => {
        try {
          ws.send(e.data as never);
        } catch {}
      });
      upstream.addEventListener("close", () => {
        try {
          ws.close();
        } catch {}
      });
      upstream.addEventListener("error", () => {
        try {
          ws.close();
        } catch {}
      });
    },

    message(ws: ServerWebSocket<WsProxyData>, message: string | Buffer): void {
      opts.onClientMessage?.();
      const upstream = ws.data.upstream;
      const frame = typeof message === "string" ? message : message.buffer;
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        try {
          upstream.send(frame as never);
        } catch {}
        return;
      }
      if (ws.data.pending.length >= MAX_PENDING_FRAMES) {
        // Backlog overflow: upstream isn't draining. 1011 = internal error.
        try {
          ws.close(1011, "ws-proxy backlog overflow");
        } catch {}
        try {
          ws.data.upstream?.close();
        } catch {}
        return;
      }
      ws.data.pending.push(frame as ArrayBuffer | string);
    },

    close(ws: ServerWebSocket<WsProxyData>): void {
      try {
        ws.data.upstream?.close();
      } catch {}
    },
  };
}

export type WsUpgrader = ReturnType<typeof makeWsUpgrader>;

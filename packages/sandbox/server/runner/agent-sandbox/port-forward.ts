/**
 * 127.0.0.1 → in-pod TCP tunnel via the Kubernetes apiserver.
 *
 * Each inbound TCP connection on the local listener spawns a fresh
 * WebSocket using `@kubernetes/client-node`'s `PortForward` helper —
 * matches `kubectl port-forward`'s semantics. Lifecycle is mutual:
 * client socket close → close the apiserver WS; WS close → destroy the
 * client socket. Called by the agent-sandbox runner to reach the daemon
 * (and previously the dev port; daemon owns the proxy now).
 *
 * Extracted from `runner.ts` so the runner reads as orchestration. The
 * tunnel's only dependency on the runner is the `onInvalidate(handle)`
 * callback, fired when the apiserver WS errors so the runner can drop
 * cached state and force a re-rehydrate on the next access.
 */

import { createHash } from "node:crypto";
import * as net from "node:net";
import { PassThrough } from "node:stream";
import { type KubeConfig, PortForward } from "@kubernetes/client-node";

// Deterministic local-port range. Same (handle, containerPort) → same host
// port across mesh restarts, so `previewUrl` cached in vmMap stays valid
// when the mesh process recycles. Birthday-collision probability stays <1%
// up to ~140 concurrent forwarders. EADDRINUSE walks the range forward
// until bind succeeds.
const PORT_RANGE_START = 40000;
const PORT_RANGE_SIZE = 10000;
const PORT_WALK_LIMIT = 256;

// Structural type for the WebSocket returned by PortForward.portForward —
// we only need close/on to manage lifecycle; pulling in `isomorphic-ws`
// for one type isn't worth it.
interface ForwardWebSocket {
  close: () => void;
  on: (event: "close" | "error", handler: () => void) => void;
}

export interface PortForwarder {
  server: net.Server;
  localPort: number;
}

export interface K8sPortForwarderDeps {
  kubeConfig: KubeConfig;
  namespace: string;
  /** Prefix for the few warn() lines this module emits. */
  logLabel?: string;
  /**
   * Invoked when a forwarded WS errors or the connect itself fails, so
   * callers can drop the in-memory record keyed by `handle`. Default:
   * no-op (suitable for tests that don't care about cache invalidation).
   */
  onInvalidate?: (handle: string) => void;
}

export class K8sPortForwarder {
  private readonly portForward: PortForward;
  private readonly namespace: string;
  private readonly logLabel: string;
  private readonly onInvalidate: (handle: string) => void;

  constructor(deps: K8sPortForwarderDeps) {
    this.portForward = new PortForward(deps.kubeConfig);
    this.namespace = deps.namespace;
    this.logLabel = deps.logLabel ?? "K8sPortForwarder";
    this.onInvalidate = deps.onInvalidate ?? (() => {});
  }

  /**
   * Opens a 127.0.0.1 TCP listener that tunnels each inbound connection to
   * `podName:containerPort` via the apiserver. `handle` defaults to
   * `podName` and seeds the deterministic-port hash; pass it explicitly
   * when the handle outlives the pod (operator-driven pod recreate).
   */
  open(
    podName: string,
    containerPort: number,
    handle: string = podName,
  ): Promise<PortForwarder> {
    const startPort = deterministicLocalPort(handle, containerPort);
    return new Promise((resolve, reject) => {
      const tryBind = (port: number, attempt: number) => {
        const server = net.createServer((socket) =>
          this.handleConnection(socket, podName, containerPort, handle),
        );
        server.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && attempt < PORT_WALK_LIMIT) {
            // Release the failed listener before walking forward — a failed
            // listen() leaves the Server holding the connection-handler
            // closure; closing makes the leak trivially visible to GC.
            try {
              server.close();
            } catch {}
            const next =
              PORT_RANGE_START +
              ((port - PORT_RANGE_START + 1) % PORT_RANGE_SIZE);
            tryBind(next, attempt + 1);
            return;
          }
          reject(err);
        });
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            server.close();
            reject(new Error("port-forward listener failed to bind"));
            return;
          }
          resolve({ server, localPort: address.port });
        });
      };
      tryBind(startPort, 0);
    });
  }

  close(forwarder: PortForwarder): void {
    forwarder.server.close((err) => {
      if (err) {
        console.warn(
          `[${this.logLabel}] port-forward close on :${forwarder.localPort} errored: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  private handleConnection(
    socket: net.Socket,
    podName: string,
    containerPort: number,
    handle: string,
  ): void {
    // Inbound bytes pipe through a PassThrough rather than the socket
    // directly: `portForward` attaches its 'data' listener only after the
    // WebSocket opens (async); on Bun, bytes arriving in that window are
    // dropped. Piping synchronously into a PassThrough buffers them until
    // the library drains it.
    const inbound = new PassThrough();
    let ws: ForwardWebSocket | null = null;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      inbound.destroy();
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
      if (!socket.destroyed) socket.destroy();
    };

    socket.pipe(inbound);
    socket.on("error", cleanup);
    socket.on("close", cleanup);

    this.portForward
      .portForward(
        this.namespace,
        podName,
        [containerPort],
        socket,
        null,
        inbound,
      )
      .then((res) => {
        // retryCount=0 (default) → raw WebSocket; retryCount>0 → factory fn.
        const opened = typeof res === "function" ? res() : res;
        if (!opened) {
          cleanup();
          return;
        }
        ws = opened as ForwardWebSocket;
        ws.on("close", cleanup);
        ws.on("error", () => {
          this.onInvalidate(handle);
          cleanup();
        });
        if (closed) {
          try {
            ws.close();
          } catch {}
        }
      })
      .catch((err: unknown) => {
        console.warn(
          `[${this.logLabel}] port-forward to ${podName}:${containerPort} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.onInvalidate(handle);
        cleanup();
      });
  }
}

/** Exposed for tests. Production callers should use `K8sPortForwarder.open`. */
export function deterministicLocalPort(
  handle: string,
  containerPort: number,
): number {
  const hash = createHash("sha256")
    .update(`${handle}:${containerPort}`)
    .digest();
  return PORT_RANGE_START + (hash.readUInt32BE(0) % PORT_RANGE_SIZE);
}

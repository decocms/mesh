/**
 * Shared NATS Connection Provider
 *
 * Manages a single NATS connection shared by all NATS implementations:
 * - NatsCancelBroadcast (decopilot cancel)
 * - NatsStreamBuffer (decopilot JetStream relay)
 * - NatsNotifyStrategy (event bus wake-up)
 * - NatsSSEBroadcast (cross-pod SSE fan-out)
 *
 * NATS connection is initialized in the background with exponential backoff.
 * Consumers should use onReady() to defer work until the connection is available.
 */

import { connect, type JetStreamClient, type NatsConnection } from "nats";

const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 3_000;
const CONNECT_TIMEOUT_MS = 3_000;

export interface NatsConnectionProvider {
  /** Fire-and-forget — starts background connection with retry. */
  init(url: string | string[]): void;
  /** Returns true if connected and not closed/draining. */
  isConnected(): boolean;
  /** Returns the shared connection, or null if not connected. */
  getConnection(): NatsConnection | null;
  /** Returns a JetStream client, or null if not connected. */
  getJetStream(): JetStreamClient | null;
  /** Registers a callback that fires when NATS connects. Fires immediately if already connected. */
  onReady(callback: () => void): void;
  /** Stops retry loop, drains connection. */
  drain(): Promise<void>;
}

export interface NatsConnectionProviderOptions {
  connectFn?: (opts: {
    servers: string | string[];
    timeout: number;
    reconnect: boolean;
    maxReconnectAttempts: number;
  }) => Promise<NatsConnection>;
}

/**
 * Create a NatsConnectionProvider instance.
 * Typically one per process.
 */
export function createNatsConnectionProvider(
  options?: NatsConnectionProviderOptions,
): NatsConnectionProvider {
  const connectFn = options?.connectFn ?? defaultConnect;

  let nc: NatsConnection | null = null;
  let js: JetStreamClient | null = null;
  let initialized = false;
  let stopped = false;
  const readyCallbacks: Array<() => void> = [];

  function checkConnected(): boolean {
    return nc !== null && !nc.isClosed() && !nc.isDraining();
  }

  function fireReady(): void {
    for (const cb of readyCallbacks.splice(0)) {
      try {
        cb();
      } catch {
        // swallow callback errors
      }
    }
  }

  async function connectWithRetry(url: string | string[]): Promise<void> {
    let attempt = 0;
    while (!stopped) {
      try {
        nc = await connectFn({
          servers: url,
          timeout: CONNECT_TIMEOUT_MS,
          reconnect: true,
          maxReconnectAttempts: -1,
        });
        js = null; // invalidate cached JetStream client for fresh connection
        fireReady();
        return;
      } catch {
        attempt++;
        const delay = Math.min(
          BASE_DELAY_MS * 2 ** (attempt - 1),
          MAX_DELAY_MS,
        );
        const jitteredDelay = delay * (0.5 + Math.random() * 0.5);
        await sleep(jitteredDelay);
      }
    }
  }

  return {
    init(url: string | string[]): void {
      if (initialized) return;
      initialized = true;
      connectWithRetry(url).catch(() => {});
    },

    isConnected(): boolean {
      return checkConnected();
    },

    getConnection(): NatsConnection | null {
      return checkConnected() ? nc : null;
    },

    getJetStream(): JetStreamClient | null {
      if (!checkConnected()) return null;
      if (!js) {
        js = nc!.jetstream();
      }
      return js;
    },

    onReady(callback: () => void): void {
      if (checkConnected()) {
        try {
          callback();
        } catch {
          // swallow callback errors (consistent with fireReady)
        }
        return;
      }
      readyCallbacks.push(callback);
    },

    async drain(): Promise<void> {
      stopped = true;
      js = null;
      if (nc) {
        const conn = nc;
        nc = null;
        await conn.drain().catch(() => {});
      }
    },
  };
}

function defaultConnect(opts: {
  servers: string | string[];
  timeout: number;
  reconnect: boolean;
  maxReconnectAttempts: number;
}): Promise<NatsConnection> {
  return connect(opts);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

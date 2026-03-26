/**
 * Shared SSE subscription factory
 *
 * Manages ref-counted EventSource connections so multiple React components
 * can subscribe to the same SSE endpoint without opening duplicate connections.
 *
 * Each call to `createSSESubscription` creates an independent connection pool
 * keyed by a caller-provided key (typically an orgId).
 *
 * Reconnection: When EventSource enters CLOSED state (server restart, network
 * change), the connection is automatically re-established with exponential
 * backoff (1s → 2s → 4s, capped at 30s). Existing event listeners are
 * re-attached to the new EventSource transparently.
 */

/** Max reconnect delay in ms */
const MAX_RECONNECT_DELAY_MS = 30_000;
/** Base reconnect delay in ms */
const BASE_RECONNECT_DELAY_MS = 1_000;

interface SharedConnection {
  es: EventSource;
  refCount: number;
  /** Active handlers to re-attach after reconnect */
  handlers: Set<(e: MessageEvent) => void>;
  /** Current reconnect attempt (reset on successful open) */
  reconnectAttempt: number;
  /** Pending reconnect timer */
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface SSESubscriptionOptions {
  /** URL builder given a connection key */
  buildUrl: (key: string) => string;
  /** SSE event types to listen for */
  eventTypes: string[];
}

export interface SSESubscription {
  /**
   * Subscribe to SSE events for the given key.
   * Returns an unsubscribe function.
   *
   * Multiple subscribers share one EventSource per key; the connection
   * is closed when the last subscriber unsubscribes.
   */
  subscribe: (key: string, handler: (e: MessageEvent) => void) => () => void;
}

export function createSSESubscription(
  options: SSESubscriptionOptions,
): SSESubscription {
  const { buildUrl, eventTypes } = options;
  const connections = new Map<string, SharedConnection>();

  function attachListeners(
    es: EventSource,
    handlers: Set<(e: MessageEvent) => void>,
  ): void {
    for (const type of eventTypes) {
      for (const handler of handlers) {
        es.addEventListener(type, handler);
      }
    }
  }

  function createEventSource(key: string, conn: SharedConnection): void {
    const es = new EventSource(buildUrl(key));

    es.onopen = () => {
      conn.reconnectAttempt = 0;
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        scheduleReconnect(key, conn);
      }
    };

    conn.es = es;
    attachListeners(es, conn.handlers);
  }

  function scheduleReconnect(key: string, conn: SharedConnection): void {
    if (conn.refCount <= 0) {
      connections.delete(key);
      return;
    }

    if (conn.reconnectTimer) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** conn.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    conn.reconnectAttempt++;

    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;

      if (conn.refCount <= 0) {
        connections.delete(key);
        return;
      }

      conn.es.close();
      createEventSource(key, conn);
    }, delay);
  }

  function getOrCreate(key: string): SharedConnection {
    let conn = connections.get(key);
    if (!conn) {
      conn = {
        es: null!,
        refCount: 0,
        handlers: new Set(),
        reconnectAttempt: 0,
        reconnectTimer: null,
      };
      createEventSource(key, conn);
      connections.set(key, conn);
    }
    return conn;
  }

  return {
    subscribe(key, handler) {
      const conn = getOrCreate(key);
      conn.refCount++;
      conn.handlers.add(handler);

      for (const type of eventTypes) {
        conn.es.addEventListener(type, handler);
      }

      let unsubscribed = false;
      return () => {
        if (unsubscribed) return;
        unsubscribed = true;

        for (const type of eventTypes) {
          conn.es.removeEventListener(type, handler);
        }
        conn.handlers.delete(handler);
        conn.refCount--;
        if (conn.refCount <= 0) {
          if (conn.reconnectTimer) {
            clearTimeout(conn.reconnectTimer);
          }
          conn.es.close();
          connections.delete(key);
        }
      };
    },
  };
}

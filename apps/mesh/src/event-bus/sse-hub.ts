/**
 * SSE Hub — In-memory fan-out for event bus events
 *
 * Provides a lightweight pub/sub layer that SSE connections subscribe to.
 * When events are published through the EventBus, they are also pushed
 * to all connected SSE clients for the same organization.
 *
 * Design goals:
 * - Zero buffering: events are written directly to the stream
 * - Org-scoped: listeners are keyed by organizationId
 * - Bounded: max connections per org to prevent OOM
 * - Cleanup on disconnect: listeners removed when HTTP connection closes
 */

import type { Event } from "../storage/types";

// ============================================================================
// Types
// ============================================================================

export interface SSEListener {
  /** Unique listener ID for removal */
  id: string;
  /** Organization this listener belongs to */
  organizationId: string;
  /** Optional event type patterns to filter (supports wildcard suffix, e.g. "workflow.*") */
  typePatterns: string[] | null;
  /** Callback to push an event to the SSE stream */
  push: (event: SSEEvent) => void;
}

export interface SSEEvent {
  id: string;
  type: string;
  source: string;
  subject?: string | null;
  data?: unknown;
  time: string;
}

// ============================================================================
// Configuration
// ============================================================================

/** Maximum concurrent SSE connections per organization */
const MAX_CONNECTIONS_PER_ORG = 50;

/** Maximum total SSE connections across all orgs */
const MAX_TOTAL_CONNECTIONS = 500;

// ============================================================================
// SSE Hub
// ============================================================================

/**
 * Global SSE hub for fan-out of event bus events to SSE connections.
 *
 * This is a singleton — there's one hub per process. It holds no event data,
 * only references to active listener callbacks. Memory usage is proportional
 * to the number of connected SSE clients, not the number of events.
 */
class SSEHub {
  /** Listeners indexed by organizationId for fast lookup */
  private listeners = new Map<string, Map<string, SSEListener>>();
  private totalCount = 0;

  /**
   * Register a new SSE listener for an organization.
   *
   * @returns The listener ID (for removal), or null if limits are exceeded.
   */
  add(listener: SSEListener): string | null {
    if (this.totalCount >= MAX_TOTAL_CONNECTIONS) {
      console.warn(
        `[SSEHub] Total connection limit reached (${MAX_TOTAL_CONNECTIONS})`,
      );
      return null;
    }

    let orgListeners = this.listeners.get(listener.organizationId);
    if (!orgListeners) {
      orgListeners = new Map();
      this.listeners.set(listener.organizationId, orgListeners);
    }

    if (orgListeners.size >= MAX_CONNECTIONS_PER_ORG) {
      console.warn(
        `[SSEHub] Per-org connection limit reached for ${listener.organizationId} (${MAX_CONNECTIONS_PER_ORG})`,
      );
      return null;
    }

    orgListeners.set(listener.id, listener);
    this.totalCount++;

    return listener.id;
  }

  /**
   * Remove a listener by ID and organization.
   */
  remove(organizationId: string, listenerId: string): void {
    const orgListeners = this.listeners.get(organizationId);
    if (!orgListeners) return;

    if (orgListeners.delete(listenerId)) {
      this.totalCount--;
      if (orgListeners.size === 0) {
        this.listeners.delete(organizationId);
      }
    }
  }

  /**
   * Fan out an event to all matching SSE listeners for the organization.
   *
   * This is called from the EventBus publish path. It's synchronous and
   * non-blocking — each listener's push callback writes to a ReadableStream.
   */
  emit(organizationId: string, event: SSEEvent): void {
    const orgListeners = this.listeners.get(organizationId);
    if (!orgListeners || orgListeners.size === 0) return;

    for (const listener of orgListeners.values()) {
      // Apply type filter if specified
      if (
        listener.typePatterns &&
        !matchesAnyPattern(event.type, listener.typePatterns)
      ) {
        continue;
      }

      try {
        listener.push(event);
      } catch {
        // Listener's stream is broken — remove it
        this.remove(organizationId, listener.id);
      }
    }
  }

  /**
   * Get the number of active listeners for an organization.
   */
  countForOrg(organizationId: string): number {
    return this.listeners.get(organizationId)?.size ?? 0;
  }

  /**
   * Get total active listener count.
   */
  get count(): number {
    return this.totalCount;
  }
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if an event type matches any of the given patterns.
 * Supports exact match and wildcard suffix (e.g., "workflow.*" matches "workflow.execution.created").
 */
function matchesAnyPattern(eventType: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === eventType) return true;
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -1); // "workflow." from "workflow.*"
      if (eventType.startsWith(prefix)) return true;
    }
  }
  return false;
}

// ============================================================================
// Singleton & Helpers
// ============================================================================

/** Global SSE hub instance */
export const sseHub = new SSEHub();

/**
 * Convert a database Event to an SSEEvent for streaming.
 */
export function toSSEEvent(event: Event): SSEEvent {
  return {
    id: event.id,
    type: event.type,
    source: event.source,
    subject: event.subject,
    data: event.data ? tryParseJSON(event.data) : undefined,
    time: event.time,
  };
}

function tryParseJSON(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

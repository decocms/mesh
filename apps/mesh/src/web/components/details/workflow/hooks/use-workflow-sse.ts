/**
 * useWorkflowSSE — Subscribe to workflow SSE events and invalidate queries
 *
 * Connects to the /org/:orgId/watch?types=workflow.* SSE endpoint and
 * invalidates the relevant React Query caches when workflow events arrive.
 * This replaces polling for real-time workflow execution updates.
 *
 * Invalidation is debounced: rapid-fire events (e.g. parallel step executions)
 * are coalesced into a single invalidation pass every 500ms.
 *
 * Uses useSyncExternalStore for proper React 19 subscription lifecycle.
 * The EventSource is ref-counted so multiple components share one connection.
 */

import { useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";

// ============================================================================
// Shared EventSource per org (ref-counted)
// ============================================================================

interface SharedConnection {
  es: EventSource;
  refCount: number;
  queryClients: Set<QueryClient>;
  /** Pending debounce timer for coalescing invalidations */
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

const connections = new Map<string, SharedConnection>();

/** Tool names whose query caches should be invalidated on workflow events */
const INVALIDATION_TARGETS = [
  "COLLECTION_WORKFLOW_EXECUTION_LIST",
  "COLLECTION_WORKFLOW_EXECUTION_GET",
  "COLLECTION_WORKFLOW_EXECUTION_GET_STEP_RESULT",
];

const WORKFLOW_EVENT_TYPES = [
  "workflow.execution.created",
  "workflow.execution.resumed",
  "workflow.step.execute",
  "workflow.step.completed",
];

/** Debounce window — coalesce rapid SSE events into one invalidation */
const DEBOUNCE_MS = 500;

function invalidateAllClients(conn: SharedConnection): void {
  for (const client of conn.queryClients) {
    client.invalidateQueries({
      predicate: (query) =>
        query.queryKey.some(
          (k) => typeof k === "string" && INVALIDATION_TARGETS.includes(k),
        ),
    });
  }
}

function scheduleInvalidation(conn: SharedConnection): void {
  // If a timer is already pending, the upcoming flush will cover this event too
  if (conn.debounceTimer !== null) return;

  conn.debounceTimer = setTimeout(() => {
    conn.debounceTimer = null;
    invalidateAllClients(conn);
  }, DEBOUNCE_MS);
}

function getOrCreateConnection(orgId: string): SharedConnection {
  let conn = connections.get(orgId);

  if (!conn) {
    const url = `/org/${orgId}/watch?types=workflow.*`;
    const es = new EventSource(url);

    conn = { es, refCount: 0, queryClients: new Set(), debounceTimer: null };
    connections.set(orgId, conn);

    const onEvent = () => scheduleInvalidation(conn!);

    for (const eventType of WORKFLOW_EVENT_TYPES) {
      es.addEventListener(eventType, onEvent);
    }

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        if (conn!.debounceTimer !== null) {
          clearTimeout(conn!.debounceTimer);
        }
        connections.delete(orgId);
      }
    };
  }

  return conn;
}

// Snapshot is constant — we don't derive render state from SSE,
// we only use the subscription for its side-effect (query invalidation).
const getSnapshot = () => 0;

// ============================================================================
// React Hook
// ============================================================================

/**
 * Subscribe to workflow SSE events for the current organization.
 *
 * When any workflow.* event arrives, the relevant React Query caches
 * are invalidated so components automatically refetch fresh data.
 * Rapid events are debounced (500ms) to avoid excessive refetches.
 *
 * Call this once near the top of the workflow UI tree.
 */
export function useWorkflowSSE(): void {
  const { org } = useProjectContext();
  const queryClient = useQueryClient();

  const orgId = org.id;

  const subscribe = (onStoreChange: () => void) => {
    const conn = getOrCreateConnection(orgId);
    conn.refCount++;
    conn.queryClients.add(queryClient);

    // Attach per-subscriber handler so useSyncExternalStore can track changes
    const handler = () => onStoreChange();
    for (const eventType of WORKFLOW_EVENT_TYPES) {
      conn.es.addEventListener(eventType, handler);
    }

    return () => {
      for (const eventType of WORKFLOW_EVENT_TYPES) {
        conn.es.removeEventListener(eventType, handler);
      }

      conn.queryClients.delete(queryClient);
      conn.refCount--;

      if (conn.refCount <= 0) {
        if (conn.debounceTimer !== null) {
          clearTimeout(conn.debounceTimer);
        }
        conn.es.close();
        connections.delete(orgId);
      }
    };
  };

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

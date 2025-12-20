/**
 * useNodeMetrics Hook
 *
 * Fetches monitoring logs and aggregates metrics per gateway and connection node.
 * Used by MeshMiniMap to display metrics on each node.
 */

import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";

// ============================================================================
// Types
// ============================================================================

export type MetricsMode = "requests" | "errors" | "latency";

export interface NodeMetric {
  requests: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number;
}

export interface NodeMetricsMap {
  gateways: Map<string, NodeMetric>;
  connections: Map<string, NodeMetric>;
}

interface MonitoringLogWithGateway {
  id: string;
  connectionId: string;
  connectionTitle: string;
  toolName: string;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
  timestamp: string;
  gatewayId?: string | null;
}

interface MonitoringLogsResponse {
  logs: MonitoringLogWithGateway[];
  total: number;
}

// ============================================================================
// Aggregation Logic
// ============================================================================

function aggregateMetrics(logs: MonitoringLogWithGateway[]): NodeMetricsMap {
  const gatewayMetrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();
  const connectionMetrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();

  for (const log of logs) {
    // Aggregate by connection
    const connId = log.connectionId;
    if (connId) {
      const existing = connectionMetrics.get(connId) ?? {
        requests: 0,
        errors: 0,
        totalLatency: 0,
      };
      connectionMetrics.set(connId, {
        requests: existing.requests + 1,
        errors: existing.errors + (log.isError ? 1 : 0),
        totalLatency: existing.totalLatency + log.durationMs,
      });
    }

    // Aggregate by gateway
    const gatewayId = log.gatewayId;
    if (gatewayId) {
      const existing = gatewayMetrics.get(gatewayId) ?? {
        requests: 0,
        errors: 0,
        totalLatency: 0,
      };
      gatewayMetrics.set(gatewayId, {
        requests: existing.requests + 1,
        errors: existing.errors + (log.isError ? 1 : 0),
        totalLatency: existing.totalLatency + log.durationMs,
      });
    }
  }

  // Convert to NodeMetric format
  const gateways = new Map<string, NodeMetric>();
  for (const [id, data] of gatewayMetrics) {
    gateways.set(id, {
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  const connections = new Map<string, NodeMetric>();
  for (const [id, data] of connectionMetrics) {
    connections.set(id, {
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  return { gateways, connections };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

export function formatMetricValue(
  metric: NodeMetric | undefined,
  mode: MetricsMode,
): string {
  if (!metric) return "—";

  switch (mode) {
    case "requests":
      return metric.requests === 0 ? "—" : metric.requests.toLocaleString();
    case "errors":
      return metric.errorRate === 0 ? "—" : `${metric.errorRate.toFixed(1)}%`;
    case "latency":
      return metric.avgLatencyMs === 0
        ? "—"
        : `${Math.round(metric.avgLatencyMs)}ms`;
  }
}

export function getMetricNumericValue(
  metric: NodeMetric | undefined,
  mode: MetricsMode,
): number {
  if (!metric) return 0;

  switch (mode) {
    case "requests":
      return metric.requests;
    case "errors":
      return metric.errorRate;
    case "latency":
      return metric.avgLatencyMs;
  }
}

export function getMetricLabel(mode: MetricsMode): string {
  switch (mode) {
    case "requests":
      return "Requests";
    case "errors":
      return "Error Rate";
    case "latency":
      return "Latency";
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useNodeMetrics(): NodeMetricsMap {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 1000, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  return aggregateMetrics(logs);
}

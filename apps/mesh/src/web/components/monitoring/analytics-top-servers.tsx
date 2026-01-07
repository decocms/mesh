/**
 * Top Servers Analytics Component
 *
 * Displays a horizontal bar chart of MCP servers sorted by tool calls, errors, or latency.
 */

import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Container } from "@untitledui/icons";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deco/ui/components/toggle-group.tsx";
import { useNavigate } from "@tanstack/react-router";
import { HomeGridCell } from "@/web/routes/orgs/home/home-grid-cell.tsx";
import type { MonitoringLogsWithGatewayResponse } from "./index";

export type MetricsMode = "requests" | "errors" | "latency";

interface ServerMetric {
  connectionId: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number;
}

function getLast24HoursDateRange() {
  // Round to the nearest 5 minutes to avoid infinite re-suspending
  // (otherwise millisecond changes in Date cause new query keys each render)
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  const roundedNow = Math.floor(now / fiveMinutes) * fiveMinutes;
  const endDate = new Date(roundedNow);
  const startDate = new Date(roundedNow - 24 * 60 * 60 * 1000);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

function aggregateServerMetrics(
  logs: Array<{
    connectionId?: string | null;
    isError: boolean;
    durationMs: number;
  }>,
): Map<string, ServerMetric> {
  const metrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();

  for (const log of logs) {
    if (!log.connectionId) continue;

    const existing = metrics.get(log.connectionId) ?? {
      requests: 0,
      errors: 0,
      totalLatency: 0,
    };

    metrics.set(log.connectionId, {
      requests: existing.requests + 1,
      errors: existing.errors + (log.isError ? 1 : 0),
      totalLatency: existing.totalLatency + log.durationMs,
    });
  }

  const result = new Map<string, ServerMetric>();
  for (const [connectionId, data] of metrics) {
    result.set(connectionId, {
      connectionId,
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  return result;
}

function formatMetricValue(metric: ServerMetric, mode: MetricsMode): string {
  switch (mode) {
    case "requests":
      return metric.requests.toLocaleString();
    case "errors":
      return `${metric.errorRate.toFixed(1)}%`;
    case "latency":
      return `${Math.round(metric.avgLatencyMs)}ms`;
  }
}

function getMetricNumericValue(
  metric: ServerMetric,
  mode: MetricsMode,
): number {
  switch (mode) {
    case "requests":
      return metric.requests;
    case "errors":
      return metric.errorRate;
    case "latency":
      return metric.avgLatencyMs;
  }
}

function getMetricPercentage(
  metric: ServerMetric,
  maxValue: number,
  mode: MetricsMode,
): number {
  if (maxValue === 0) return 0;
  const value = getMetricNumericValue(metric, mode);
  return Math.min((value / maxValue) * 100, 100);
}

interface TopServersContentProps {
  metricsMode: MetricsMode;
  onMetricsModeChange?: (mode: MetricsMode) => void;
}

function TopServersContent({
  metricsMode,
  onMetricsModeChange,
}: TopServersContentProps) {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const connections = useConnections({ pageSize: 100 }) ?? [];

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsWithGatewayResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 1000, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];

  const metricsMap = aggregateServerMetrics(logs);

  // Filter connections that have metrics and sort them
  const connectionsWithMetrics = connections
    .map((connection) => ({
      connection,
      metric: metricsMap.get(connection.id),
    }))
    .filter((item) => item.metric)
    .sort(
      (a, b) =>
        getMetricNumericValue(b.metric!, metricsMode) -
        getMetricNumericValue(a.metric!, metricsMode),
    )
    .slice(0, 15);

  const firstMetric = connectionsWithMetrics[0]?.metric;
  const maxValue = firstMetric
    ? getMetricNumericValue(firstMetric, metricsMode)
    : 1;

  const handleConnectionClick = (connectionId: string) => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: {
        from: "now-24h",
        to: "now",
        connectionId: [connectionId],
        ...(metricsMode === "errors" && { status: "errors" as const }),
      },
    });
  };

  const handleTitleClick = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
    });
  };

  const barColor =
    metricsMode === "requests"
      ? "bg-chart-1"
      : metricsMode === "errors"
        ? "bg-chart-3"
        : "bg-chart-4";

  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Connections</p>}
      onTitleClick={handleTitleClick}
      action={
        onMetricsModeChange ? (
          <ToggleGroup
            type="single"
            value={metricsMode}
            onValueChange={(v) => v && onMetricsModeChange(v as MetricsMode)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem
              value="requests"
              className="text-xs px-2 cursor-pointer"
            >
              Calls
            </ToggleGroupItem>
            <ToggleGroupItem
              value="errors"
              className="text-xs px-2 cursor-pointer"
            >
              Errors
            </ToggleGroupItem>
            <ToggleGroupItem
              value="latency"
              className="text-xs px-2 cursor-pointer"
            >
              Latency
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null
      }
    >
      {connectionsWithMetrics.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          No server activity in the last 24 hours
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {connectionsWithMetrics.map(({ connection, metric }) => {
            const percentage = getMetricPercentage(
              metric!,
              maxValue,
              metricsMode,
            );
            return (
              <div
                key={connection.id}
                className="group cursor-pointer flex items-center gap-2"
                onClick={() => handleConnectionClick(connection.id)}
              >
                <IntegrationIcon
                  icon={connection.icon}
                  name={connection.title}
                  size="xs"
                  fallbackIcon={<Container />}
                  className="shrink-0"
                />
                <span className="text-xs font-medium text-foreground truncate min-w-0 w-32">
                  {connection.title}
                </span>
                <div className="relative h-2 bg-muted/50 overflow-hidden flex-1">
                  <div
                    className={`h-full transition-all duration-500 ease-out group-hover:opacity-80 ${barColor}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums shrink-0 text-foreground font-normal">
                  {formatMetricValue(metric!, metricsMode)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </HomeGridCell>
  );
}

function TopServersSkeleton() {
  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Connections</p>}
    >
      <div className="space-y-3 w-full">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-6 w-6 bg-muted animate-pulse rounded-md shrink-0" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded shrink-0" />
            <div className="h-2 bg-muted animate-pulse flex-1" />
            <div className="h-3 w-12 bg-muted animate-pulse rounded shrink-0" />
          </div>
        ))}
      </div>
    </HomeGridCell>
  );
}

export const TopServers = {
  Content: TopServersContent,
  Skeleton: TopServersSkeleton,
};

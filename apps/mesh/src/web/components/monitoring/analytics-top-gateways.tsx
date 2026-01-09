/**
 * Top Gateways Analytics Component
 *
 * Displays a horizontal bar chart of MCP gateways sorted by tool calls, errors, or latency.
 */

import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { CpuChip02 } from "@untitledui/icons";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useNavigate } from "@tanstack/react-router";
import { HomeGridCell } from "@/web/routes/orgs/home/home-grid-cell.tsx";
import type { MonitoringLogsWithGatewayResponse } from "./index";

type MetricsMode = "requests" | "errors" | "latency";

interface GatewayMetric {
  gatewayId: string;
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

function aggregateGatewayMetrics(
  logs: Array<{
    gatewayId?: string | null;
    isError: boolean;
    durationMs: number;
  }>,
): Map<string, GatewayMetric> {
  const metrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();

  for (const log of logs) {
    if (!log.gatewayId) continue;

    const existing = metrics.get(log.gatewayId) ?? {
      requests: 0,
      errors: 0,
      totalLatency: 0,
    };

    metrics.set(log.gatewayId, {
      requests: existing.requests + 1,
      errors: existing.errors + (log.isError ? 1 : 0),
      totalLatency: existing.totalLatency + log.durationMs,
    });
  }

  const result = new Map<string, GatewayMetric>();
  for (const [gatewayId, data] of metrics) {
    result.set(gatewayId, {
      gatewayId,
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  return result;
}

function formatMetricValue(metric: GatewayMetric, mode: MetricsMode): string {
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
  metric: GatewayMetric,
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
  metric: GatewayMetric,
  maxValue: number,
  mode: MetricsMode,
): number {
  if (maxValue === 0) return 0;
  const value = getMetricNumericValue(metric, mode);
  return Math.min((value / maxValue) * 100, 100);
}

interface TopGatewaysContentProps {
  metricsMode: MetricsMode;
}

function TopGatewaysContent({ metricsMode }: TopGatewaysContentProps) {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const gateways = useGateways({ pageSize: 100 }) ?? [];

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

  const metricsMap = aggregateGatewayMetrics(logs);

  // Filter gateways that have metrics and sort them
  const gatewaysWithMetrics = gateways
    .map((gateway) => ({
      gateway,
      metric: metricsMap.get(gateway.id),
    }))
    .filter((item) => item.metric)
    .sort(
      (a, b) =>
        getMetricNumericValue(b.metric!, metricsMode) -
        getMetricNumericValue(a.metric!, metricsMode),
    )
    .slice(0, 15);

  const firstMetric = gatewaysWithMetrics[0]?.metric;
  const maxValue = firstMetric
    ? getMetricNumericValue(firstMetric, metricsMode)
    : 1;

  const handleGatewayClick = (gatewayId: string) => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: {
        from: "now-24h",
        to: "now",
        gatewayId: [gatewayId],
        ...(metricsMode === "errors" && { status: "errors" as const }),
      },
    });
  };

  const handleTitleClick = () => {
    navigate({
      to: "/$org/gateways",
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
      title={<p className="text-sm text-muted-foreground">Agents</p>}
      onTitleClick={handleTitleClick}
    >
      {gatewaysWithMetrics.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          No agent activity in the last 24 hours
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {gatewaysWithMetrics.map(({ gateway, metric }) => {
            const percentage = getMetricPercentage(
              metric!,
              maxValue,
              metricsMode,
            );
            return (
              <div
                key={gateway.id}
                className="group cursor-pointer flex items-center gap-2"
                onClick={() => handleGatewayClick(gateway.id)}
              >
                <IntegrationIcon
                  icon={gateway.icon}
                  name={gateway.title}
                  size="xs"
                  fallbackIcon={<CpuChip02 />}
                  className="shrink-0"
                />
                <span className="text-xs font-medium text-foreground truncate min-w-0 w-32">
                  {gateway.title}
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

function TopGatewaysSkeleton() {
  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Agents</p>}
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

export const TopGateways = {
  Content: TopGatewaysContent,
  Skeleton: TopGatewaysSkeleton,
};

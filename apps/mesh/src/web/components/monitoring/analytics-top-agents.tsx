/**
 * Top Agents Analytics Component
 *
 * Displays a horizontal bar chart of virtual MCPs (agents) sorted by tool calls, errors, or latency.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { CpuChip02 } from "@untitledui/icons";
import {
  useMCPClient,
  useMCPToolCall,
  useProjectContext,
  useVirtualMCPs,
  WellKnownOrgMCPId,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import { HomeGridCell } from "@/web/routes/orgs/home/home-grid-cell.tsx";
import type { MonitoringLogsWithVirtualMCPResponse } from "./index";

type MetricsMode = "requests" | "errors" | "latency";

interface VirtualMCPMetric {
  virtualMcpId: string;
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

function aggregateVirtualMCPMetrics(
  logs: Array<{
    virtualMcpId?: string | null;
    isError: boolean;
    durationMs: number;
  }>,
): Map<string, VirtualMCPMetric> {
  const metrics = new Map<
    string,
    { requests: number; errors: number; totalLatency: number }
  >();

  for (const log of logs) {
    if (!log.virtualMcpId) continue;

    const existing = metrics.get(log.virtualMcpId) ?? {
      requests: 0,
      errors: 0,
      totalLatency: 0,
    };

    metrics.set(log.virtualMcpId, {
      requests: existing.requests + 1,
      errors: existing.errors + (log.isError ? 1 : 0),
      totalLatency: existing.totalLatency + log.durationMs,
    });
  }

  const result = new Map<string, VirtualMCPMetric>();
  for (const [virtualMcpId, data] of metrics) {
    result.set(virtualMcpId, {
      virtualMcpId,
      requests: data.requests,
      errors: data.errors,
      errorRate: data.requests > 0 ? (data.errors / data.requests) * 100 : 0,
      avgLatencyMs: data.requests > 0 ? data.totalLatency / data.requests : 0,
    });
  }

  return result;
}

function formatMetricValue(
  metric: VirtualMCPMetric,
  mode: MetricsMode,
): string {
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
  metric: VirtualMCPMetric,
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
  metric: VirtualMCPMetric,
  maxValue: number,
  mode: MetricsMode,
): number {
  if (maxValue === 0) return 0;
  const value = getMetricNumericValue(metric, mode);
  return Math.min((value / maxValue) * 100, 100);
}

interface TopAgentsContentProps {
  metricsMode: MetricsMode;
}

function TopAgentsContent({ metricsMode }: TopAgentsContentProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const dateRange = getLast24HoursDateRange();

  const virtualMcps = useVirtualMCPs({ pageSize: 100 }) ?? [];

  const client = useMCPClient({
    connectionId: WellKnownOrgMCPId.SELF(org.id),
    orgSlug: org.slug,
  });

  const { data: logsData } =
    useMCPToolCall<MonitoringLogsWithVirtualMCPResponse>({
      client,
      toolName: "MONITORING_LOGS_LIST",
      toolArguments: { ...dateRange, limit: 1000, offset: 0 },
      staleTime: 30_000,
      select: (result) =>
        ((result as { structuredContent?: unknown }).structuredContent ??
          result) as MonitoringLogsWithVirtualMCPResponse,
    });

  const logs = logsData?.logs ?? [];

  const metricsMap = aggregateVirtualMCPMetrics(logs);

  // Filter virtual MCPs that have metrics and sort them
  const virtualMcpsWithMetrics = virtualMcps
    .map((virtualMcp) => ({
      virtualMcp,
      metric: metricsMap.get(virtualMcp.id),
    }))
    .filter(
      (
        item,
      ): item is {
        virtualMcp: typeof item.virtualMcp;
        metric: VirtualMCPMetric;
      } => item.metric !== undefined,
    )
    .sort(
      (a, b) =>
        getMetricNumericValue(b.metric, metricsMode) -
        getMetricNumericValue(a.metric, metricsMode),
    )
    .slice(0, 15);

  const firstMetric = virtualMcpsWithMetrics[0]?.metric;
  const maxValue = firstMetric
    ? getMetricNumericValue(firstMetric, metricsMode)
    : 1;

  const handleVirtualMcpClick = (virtualMcpId: string) => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: {
        from: "now-24h",
        to: "now",
        virtualMcpId: [virtualMcpId],
        ...(metricsMode === "errors" && { status: "errors" as const }),
      },
    });
  };

  const handleTitleClick = () => {
    navigate({
      to: "/$org/agents",
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
      {virtualMcpsWithMetrics.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          No agent activity in the last 24 hours
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {virtualMcpsWithMetrics.map(({ virtualMcp, metric }) => {
            const percentage = getMetricPercentage(
              metric,
              maxValue,
              metricsMode,
            );
            return (
              <div
                key={virtualMcp.id}
                className="group cursor-pointer flex items-center gap-2"
                onClick={() => handleVirtualMcpClick(virtualMcp.id)}
              >
                <IntegrationIcon
                  icon={virtualMcp.icon}
                  name={virtualMcp.title}
                  size="xs"
                  fallbackIcon={<CpuChip02 />}
                  className="shrink-0"
                />
                <span className="text-xs font-medium text-foreground truncate min-w-0 w-32">
                  {virtualMcp.title}
                </span>
                <div className="relative h-2 bg-muted/50 overflow-hidden flex-1">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 ease-out group-hover:opacity-80",
                      barColor,
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums shrink-0 text-foreground font-normal">
                  {formatMetricValue(metric, metricsMode)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </HomeGridCell>
  );
}

function TopAgentsSkeleton() {
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

export const TopAgents = {
  Content: TopAgentsContent,
  Skeleton: TopAgentsSkeleton,
};

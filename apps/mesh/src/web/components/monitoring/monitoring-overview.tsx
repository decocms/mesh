/**
 * Monitoring Overview Components
 *
 * KPI summary, activity breakdown (connections, agents, tools, automations),
 * and AI usage section for the monitoring dashboard.
 */

import { MONITORING_CONFIG } from "./config.ts";
import {
  useMonitoringStats,
  useMonitoringLlmStats,
  useMonitoringTopTools,
} from "./hooks.ts";
import {
  MonitoringStatsRowSkeleton,
  KPIChart,
  type DateRange,
  type MonitoringStatsData,
} from "./monitoring-stats-row.tsx";
import { useConnections, useVirtualMCPs } from "@decocms/mesh-sdk";
import { cn } from "@deco/ui/lib/utils.ts";
import { Container } from "@untitledui/icons";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { HomeGridCell } from "@/web/routes/orgs/home/home-grid-cell.tsx";
import { useState, type ReactNode } from "react";
import {
  USE_MOCK_DATA,
  getMockAutomations,
  getMockAgents,
  type MockAutomation,
} from "./mock-data.ts";
import { useAutomationsList } from "@/web/hooks/use-automations.ts";
import { useMockSuspense } from "./hooks.ts";

// ============================================================================
// Helpers
// ============================================================================

export function getIntervalFromRange(range: DateRange): "1m" | "1h" | "1d" {
  const durationMs = range.endDate.getTime() - range.startDate.getTime();
  const ONE_HOUR = 60 * 60 * 1000;
  const HOURS_25 = 25 * ONE_HOUR;

  if (durationMs <= ONE_HOUR) return "1m";
  if (durationMs <= HOURS_25) return "1h";
  return "1d";
}

function formatTimestampLabel(
  timestamp: string,
  interval: "1m" | "1h" | "1d",
): string {
  const date = new Date(timestamp);
  if (interval === "1d") {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function floorToInterval(date: Date, interval: "1m" | "1h" | "1d"): Date {
  const result = new Date(date);
  if (interval === "1d") {
    result.setHours(0, 0, 0, 0);
    return result;
  }
  if (interval === "1h") {
    result.setMinutes(0, 0, 0);
    return result;
  }
  result.setSeconds(0, 0);
  return result;
}

export function buildFilledStatsData(
  points: Array<{
    timestamp: string;
    calls: number;
    errors: number;
    errorRate: number;
    avg: number;
    p50: number;
    p95: number;
  }>,
  range: DateRange,
  interval: "1m" | "1h" | "1d",
): MonitoringStatsData["data"] {
  const pointMap = new Map(
    points.map((point) => [
      floorToInterval(new Date(point.timestamp), interval).getTime(),
      point,
    ]),
  );

  const startMs = range.startDate.getTime();
  const endMs = range.endDate.getTime();
  const intervalMs =
    interval === "1m" ? 60_000 : interval === "1h" ? 3_600_000 : 86_400_000;
  const BUCKET_COUNT = Math.max(
    2,
    Math.min(60, Math.ceil((endMs - startMs) / intervalMs)),
  );
  const step = (endMs - startMs) / (BUCKET_COUNT - 1);
  const data: MonitoringStatsData["data"] = [];
  const bucketTimestamps: number[] = [];

  for (let i = 0; i < BUCKET_COUNT; i++) {
    const ts = Math.round(startMs + i * step);
    bucketTimestamps.push(ts);
    data.push({
      t: new Date(ts).toISOString(),
      ts,
      label: formatTimestampLabel(new Date(ts).toISOString(), interval),
      calls: 0,
      errors: 0,
      errorRate: 0,
      avg: 0,
      p50: 0,
      p95: 0,
    });
  }

  const counts = new Array(BUCKET_COUNT).fill(0);
  for (const [serverTs, point] of pointMap) {
    let nearest = 0;
    let minDist = Math.abs(serverTs - bucketTimestamps[0]!);
    for (let i = 1; i < bucketTimestamps.length; i++) {
      const dist = Math.abs(serverTs - bucketTimestamps[i]!);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }

    const bucket = data[nearest]!;
    bucket.calls += point.calls;
    bucket.errors += point.errors;
    bucket.avg += point.avg * point.calls;
    bucket.p50 += point.p50 * point.calls;
    bucket.p95 = Math.max(bucket.p95, point.p95);
    counts[nearest]++;
  }

  for (let i = 0; i < BUCKET_COUNT; i++) {
    const b = data[i]!;
    if (b.calls > 0) {
      b.errorRate = (b.errors / b.calls) * 100;
      b.avg = b.avg / b.calls;
      b.p50 = b.p50 / b.calls;
    }
  }

  return data;
}

// ============================================================================
// Types
// ============================================================================

export interface MonitoringStatsProps {
  displayDateRange: DateRange;
  connectionIds: string[];
  excludeConnectionIds?: string[];
  toolName?: string;
  status?: "success" | "error";
  connections: ReturnType<typeof useConnections>;
  isStreaming: boolean;
}

export interface LlmStatsProps {
  displayDateRange: DateRange;
  isStreaming: boolean;
}

export interface ActivityBreakdownProps {
  displayDateRange: DateRange;
  connectionIds: string[];
  excludeConnectionIds?: string[];
  toolName?: string;
  status?: "success" | "error";
  connections: ReturnType<typeof useConnections>;
  isStreaming: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(ms: number): string {
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// KPI Config
// ============================================================================

type LatencyMetric = "avg" | "p95";

function LatencyToggle({
  stats,
  latencyMetric,
  onToggle,
}: {
  stats: MonitoringStatsData;
  latencyMetric: LatencyMetric;
  onToggle: (m: LatencyMetric) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 md:gap-1">
      <p className="text-xs md:text-sm text-muted-foreground">Latency</p>
      <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5 w-fit">
        <button
          type="button"
          className={cn(
            "px-2 py-0.5 rounded text-left transition-colors cursor-pointer",
            latencyMetric === "avg"
              ? "bg-background shadow-sm"
              : "hover:bg-muted/80",
          )}
          onClick={() => onToggle("avg")}
        >
          <span className="text-sm md:text-lg font-medium">
            {formatDuration(stats.avgDurationMs)}
          </span>
          <span className="text-[10px] md:text-xs text-muted-foreground ml-1">
            avg
          </span>
        </button>
        <button
          type="button"
          className={cn(
            "px-2 py-0.5 rounded text-left transition-colors cursor-pointer",
            latencyMetric === "p95"
              ? "bg-background shadow-sm"
              : "hover:bg-muted/80",
          )}
          onClick={() => onToggle("p95")}
        >
          <span className="text-sm md:text-lg font-medium">
            {formatDuration(stats.p95DurationMs)}
          </span>
          <span className="text-[10px] md:text-xs text-muted-foreground ml-1">
            p95
          </span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Leaderboard (reusable bar chart list)
// ============================================================================

function Leaderboard({
  items,
  barColor,
}: {
  items: Array<{
    key: string;
    label: string;
    value: number;
    formattedValue: string;
    icon?: ReactNode;
  }>;
  barColor: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No data available</p>
    );
  }

  const maxValue = items[0]?.value ?? 1;

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const pct =
          maxValue > 0 ? Math.min((item.value / maxValue) * 100, 100) : 0;
        return (
          <div key={item.key} className="flex items-center gap-1.5">
            {item.icon}
            <span className="text-[10px] text-foreground truncate min-w-0 w-24">
              {item.label}
            </span>
            <div className="relative h-1.5 bg-muted/50 overflow-hidden flex-1">
              <div
                className={cn("h-full", barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums shrink-0 text-foreground">
              {item.formattedValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// MonitoringStats Component (KPI summary row)
// ============================================================================

function MonitoringStatsContent({
  displayDateRange,
  connectionIds,
  excludeConnectionIds,
  toolName,
  status,
  isStreaming,
}: MonitoringStatsProps) {
  const [latencyMetric, setLatencyMetric] = useState<LatencyMetric>("avg");
  const interval = getIntervalFromRange(displayDateRange);
  const { data: serverStats } = useMonitoringStats(
    {
      interval,
      startDate: displayDateRange.startDate.toISOString(),
      endDate: displayDateRange.endDate.toISOString(),
      connectionIds: connectionIds.length > 0 ? connectionIds : undefined,
      excludeConnectionIds,
      toolNames: toolName ? [toolName] : undefined,
      status,
    },
    {
      refetchInterval: isStreaming
        ? MONITORING_CONFIG.streamingRefetchInterval
        : false,
    },
  );

  const stats: MonitoringStatsData = serverStats
    ? {
        totalCalls: serverStats.totalCalls,
        totalErrors: serverStats.totalErrors,
        avgDurationMs: serverStats.avgDurationMs,
        p95DurationMs: serverStats.p95DurationMs,
        data: buildFilledStatsData(
          serverStats.timeseries,
          displayDateRange,
          interval,
        ),
      }
    : {
        totalCalls: 0,
        totalErrors: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        data: [],
      };

  return (
    <div className="border-b border-border">
      <div className="px-5 py-2 bg-muted/30 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tool Calls
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[0.5px] bg-border flex-shrink-0">
        {/* Calls */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <div className="flex flex-col gap-0.5 md:gap-1">
                <p className="text-xs md:text-sm text-muted-foreground">
                  Tool Calls
                </p>
                <p className="text-sm md:text-lg font-medium">
                  {stats.totalCalls.toLocaleString()}
                </p>
              </div>
            }
          >
            <KPIChart
              data={stats.data}
              dataKey="calls"
              colorNum={1}
              chartHeight="h-[30px] md:h-[40px]"
            />
          </HomeGridCell>
        </div>

        {/* Latency */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <LatencyToggle
                stats={stats}
                latencyMetric={latencyMetric}
                onToggle={setLatencyMetric}
              />
            }
          >
            <KPIChart
              data={stats.data}
              dataKey={latencyMetric}
              colorNum={4}
              chartHeight="h-[30px] md:h-[40px]"
            />
          </HomeGridCell>
        </div>

        {/* Errors */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <div className="flex flex-col gap-0.5 md:gap-1">
                <p className="text-xs md:text-sm text-muted-foreground">
                  Errors
                </p>
                <p className="text-sm md:text-lg font-medium">
                  {stats.totalErrors.toLocaleString()}
                </p>
              </div>
            }
          >
            <KPIChart
              data={stats.data}
              dataKey="errors"
              colorNum={3}
              chartHeight="h-[30px] md:h-[40px]"
            />
          </HomeGridCell>
        </div>
      </div>
    </div>
  );
}

export const MonitoringStats = Object.assign(MonitoringStatsContent, {
  Skeleton: MonitoringStatsRowSkeleton,
});

// ============================================================================
// Activity Breakdown (Top Connections, Top Agents, Top Tools)
// ============================================================================

function ActivityBreakdownContent({
  displayDateRange,
  connectionIds,
  excludeConnectionIds,
  toolName,
  status,
  connections,
  isStreaming,
}: ActivityBreakdownProps) {
  const interval = getIntervalFromRange(displayDateRange);

  // Fetch stats for connection breakdown
  const { data: serverStats } = useMonitoringStats(
    {
      interval,
      startDate: displayDateRange.startDate.toISOString(),
      endDate: displayDateRange.endDate.toISOString(),
      connectionIds: connectionIds.length > 0 ? connectionIds : undefined,
      excludeConnectionIds,
      toolNames: toolName ? [toolName] : undefined,
      status,
    },
    {
      refetchInterval: isStreaming
        ? MONITORING_CONFIG.streamingRefetchInterval
        : false,
    },
  );

  // Fetch top tools
  const { data: topToolsData } = useMonitoringTopTools(
    {
      interval,
      startDate: displayDateRange.startDate.toISOString(),
      endDate: displayDateRange.endDate.toISOString(),
      topN: 5,
      connectionIds: connectionIds.length > 0 ? connectionIds : undefined,
      excludeConnectionIds,
      toolNames: toolName ? [toolName] : undefined,
      status,
    },
    {
      refetchInterval: isStreaming
        ? MONITORING_CONFIG.streamingRefetchInterval
        : false,
    },
  );

  // Get agents (mock or real virtual MCPs)
  let agentItems: Array<{
    key: string;
    label: string;
    value: number;
    formattedValue: string;
  }>;

  if (USE_MOCK_DATA) {
    const { data: mockAgents } = useMockSuspense("agents", getMockAgents);
    agentItems = mockAgents.map((a) => ({
      key: a.id,
      label: a.title,
      value: a.calls,
      formattedValue: `${a.calls.toLocaleString()} calls`,
    }));
  } else {
    const virtualMcps = useVirtualMCPs();
    agentItems = virtualMcps.slice(0, 5).map((vm, i) => ({
      key: vm.id ?? `agent-${i}`,
      label: vm.title ?? "Agent",
      value: Math.max(1, 5 - i),
      formattedValue: vm.title ?? "Agent",
    }));
  }

  // Fetch automations
  let automations:
    | MockAutomation[]
    | Array<{
        id: string;
        name: string;
        active: boolean;
        trigger_count: number;
      }>;

  if (USE_MOCK_DATA) {
    const { data } = useMockSuspense("automations", getMockAutomations);
    automations = data;
  } else {
    const { data } = useAutomationsList();
    automations = data ?? [];
  }

  // Build connection leaderboard
  const connectionBreakdown = serverStats?.connectionBreakdown ?? [];
  const allConnections = connections ?? [];
  const connectionMap = new Map(allConnections.map((c) => [c.id, c]));

  const connectionItems = connectionBreakdown
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5)
    .map((m) => {
      const conn = connectionMap.get(m.connectionId);
      return {
        key: m.connectionId,
        label: conn?.title ?? m.connectionId,
        value: m.calls,
        formattedValue: `${m.calls.toLocaleString()} calls`,
        icon: (
          <IntegrationIcon
            icon={conn?.icon ?? null}
            name={conn?.title ?? m.connectionId}
            size="xs"
            fallbackIcon={<Container />}
            className="shrink-0 size-4! min-w-4!"
          />
        ),
      };
    });

  // Build tools leaderboard
  const topTools = topToolsData?.topTools ?? [];
  const toolItems = topTools.slice(0, 5).map((t) => {
    const conn = connectionMap.get(t.connectionId ?? "");
    return {
      key: t.toolName,
      label: t.toolName,
      value: t.calls,
      formattedValue: `${t.calls.toLocaleString()} calls`,
      icon: (
        <IntegrationIcon
          icon={conn?.icon ?? null}
          name={t.toolName}
          size="xs"
          fallbackIcon={<Container />}
          className="shrink-0 size-4! min-w-4!"
        />
      ),
    };
  });

  return (
    <div className="border-b border-border">
      <div className="px-5 py-2 bg-muted/30 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Activity Breakdown
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[0.5px] bg-border flex-shrink-0">
        {/* Top Connections */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <p className="text-xs md:text-sm text-muted-foreground">
                Top Connections
              </p>
            }
          >
            <Leaderboard items={connectionItems} barColor="bg-chart-1" />
          </HomeGridCell>
        </div>

        {/* Top Tools */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <p className="text-xs md:text-sm text-muted-foreground">
                Top Tools
              </p>
            }
          >
            <Leaderboard items={toolItems} barColor="bg-chart-2" />
          </HomeGridCell>
        </div>

        {/* Agents */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <p className="text-xs md:text-sm text-muted-foreground">Agents</p>
            }
          >
            <Leaderboard items={agentItems} barColor="bg-chart-5" />
          </HomeGridCell>
        </div>

        {/* Automations */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <p className="text-xs md:text-sm text-muted-foreground">
                Automations
              </p>
            }
          >
            {automations.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No automations configured
              </p>
            ) : (
              <div className="space-y-1.5">
                {automations.slice(0, 5).map((auto) => {
                  const mockAuto = auto as MockAutomation;
                  return (
                    <div key={auto.id} className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          auto.active
                            ? "bg-green-500"
                            : "bg-muted-foreground/30",
                        )}
                      />
                      <span className="text-[10px] text-foreground truncate min-w-0 flex-1">
                        {auto.name}
                      </span>
                      {mockAuto.schedule && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {mockAuto.schedule}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </HomeGridCell>
        </div>
      </div>
    </div>
  );
}

function ActivityBreakdownSkeleton() {
  return (
    <div className="border-b border-border">
      <div className="px-5 py-2 bg-muted/30 border-b border-border">
        <div className="h-3 w-28 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[0.5px] bg-border flex-shrink-0">
        {[...Array(4)].map((_, i) => (
          <HomeGridCell
            key={i}
            title={<div className="h-4 w-24 rounded bg-muted animate-pulse" />}
          >
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-1.5">
                  <div className="size-4 rounded bg-muted animate-pulse shrink-0" />
                  <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                  <div className="h-1.5 flex-1 bg-muted animate-pulse" />
                  <div className="h-2.5 w-12 rounded bg-muted animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          </HomeGridCell>
        ))}
      </div>
    </div>
  );
}

export const ActivityBreakdown = Object.assign(ActivityBreakdownContent, {
  Skeleton: ActivityBreakdownSkeleton,
});

// ============================================================================
// LlmStats Component
// ============================================================================

function LlmStatsContent({ displayDateRange, isStreaming }: LlmStatsProps) {
  const interval = getIntervalFromRange(displayDateRange);
  const { data: serverStats } = useMonitoringLlmStats(
    {
      interval,
      startDate: displayDateRange.startDate.toISOString(),
      endDate: displayDateRange.endDate.toISOString(),
    },
    {
      refetchInterval: isStreaming
        ? MONITORING_CONFIG.streamingRefetchInterval
        : false,
    },
  );

  const [latencyMetric, setLatencyMetric] = useState<LatencyMetric>("avg");

  const stats: MonitoringStatsData = serverStats
    ? {
        totalCalls: serverStats.totalCalls,
        totalErrors: serverStats.totalErrors,
        avgDurationMs: serverStats.avgDurationMs,
        p95DurationMs: serverStats.p95DurationMs,
        data: buildFilledStatsData(
          serverStats.timeseries,
          displayDateRange,
          interval,
        ),
      }
    : {
        totalCalls: 0,
        totalErrors: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        data: [],
      };

  return (
    <div className="border-b border-border">
      <div className="px-5 py-2 bg-muted/30 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          AI Usage
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[0.5px] bg-border flex-shrink-0">
        {/* AI Calls */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <div className="flex flex-col gap-0.5 md:gap-1">
                <p className="text-xs md:text-sm text-muted-foreground">
                  Total AI Calls
                </p>
                <p className="text-sm md:text-lg font-medium">
                  {stats.totalCalls.toLocaleString()}
                </p>
              </div>
            }
          >
            <KPIChart
              data={stats.data}
              dataKey="calls"
              colorNum={1}
              chartHeight="h-[30px] md:h-[40px]"
            />
          </HomeGridCell>
        </div>

        {/* AI Latency */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <LatencyToggle
                stats={stats}
                latencyMetric={latencyMetric}
                onToggle={setLatencyMetric}
              />
            }
          >
            <KPIChart
              data={stats.data}
              dataKey={latencyMetric}
              colorNum={4}
              chartHeight="h-[30px] md:h-[40px]"
            />
          </HomeGridCell>
        </div>

        {/* AI Errors */}
        <div className="bg-background">
          <HomeGridCell
            title={
              <div className="flex flex-col gap-0.5 md:gap-1">
                <p className="text-xs md:text-sm text-muted-foreground">
                  AI Errors
                </p>
                <p className="text-sm md:text-lg font-medium">
                  {stats.totalErrors.toLocaleString()}
                </p>
              </div>
            }
          >
            <KPIChart
              data={stats.data}
              dataKey="errors"
              colorNum={3}
              chartHeight="h-[30px] md:h-[40px]"
            />
          </HomeGridCell>
        </div>
      </div>
    </div>
  );
}

function LlmStatsSkeleton() {
  return (
    <div className="border-b border-border">
      <div className="px-5 py-2 bg-muted/30 border-b border-border">
        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[0.5px] bg-border flex-shrink-0">
        {[...Array(3)].map((_, i) => (
          <HomeGridCell
            key={i}
            title={
              <div className="flex flex-col gap-0.5 md:gap-1">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-5 md:h-6 w-12 rounded bg-muted animate-pulse" />
              </div>
            }
          >
            <div className="h-[30px] md:h-[40px] w-full rounded bg-muted animate-pulse" />
          </HomeGridCell>
        ))}
      </div>
    </div>
  );
}

export const LlmStats = Object.assign(LlmStatsContent, {
  Skeleton: LlmStatsSkeleton,
});

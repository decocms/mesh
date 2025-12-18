import { createToolCaller } from "@/tools/client";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { HomeGridCell } from "./home-grid-cell.tsx";

interface MonitoringLog {
  id: string;
  connectionId: string;
  connectionTitle: string;
  toolName: string;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
  timestamp: string;
}

interface MonitoringLogsResponse {
  logs: MonitoringLog[];
  total: number;
}

interface MonitoringStats {
  totalCalls: number;
  errorRate: number;
  avgDurationMs: number;
  errorRatePercent: string;
}

type BucketPoint = {
  t: string;
  ts: number;
  label: string;
  calls: number;
  errors: number;
  errorRate: number;
  p95: number;
};

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildBuckets(
  logs: MonitoringLog[],
  start: Date,
  end: Date,
  bucketCount = 8,
): BucketPoint[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const safeCount = Math.max(1, bucketCount);
  const totalRange = Math.max(1, endMs - startMs);
  const bucketSizeMs = Math.max(1, Math.floor(totalRange / safeCount));

  const buckets: Array<{
    t: string;
    ts: number;
    label: string;
    calls: number;
    errors: number;
    durations: number[];
  }> = [];

  for (let i = 0; i < safeCount; i++) {
    const d = new Date(startMs + i * bucketSizeMs);
    const t = d.toISOString();
    buckets.push({
      t,
      ts: d.getTime(),
      label: formatTimeLabel(d),
      calls: 0,
      errors: 0,
      durations: [],
    });
  }

  for (const log of logs) {
    const ts = new Date(log.timestamp).getTime();
    const rawIdx = Math.floor((ts - startMs) / bucketSizeMs);
    const idx = Math.max(0, Math.min(safeCount - 1, rawIdx));
    const bucket = buckets[idx];
    if (!bucket) continue;

    bucket.calls += 1;
    if (log.isError) bucket.errors += 1;
    if (Number.isFinite(log.durationMs)) bucket.durations.push(log.durationMs);
  }

  return buckets.map((b) => ({
    t: b.t,
    ts: b.ts,
    label: b.label,
    calls: b.calls,
    errors: b.errors,
    errorRate: b.calls > 0 ? (b.errors / b.calls) * 100 : 0,
    p95: Math.round(percentile(b.durations, 0.95)),
  }));
}

function getMinMaxTs(logs: MonitoringLog[]) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const log of logs) {
    const ts = new Date(log.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts < min) min = ts;
    if (ts > max) max = ts;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function ToolCallsKPI() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
  });

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 750, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const totalCalls = stats?.totalCalls ?? 0;

  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 8);

  const handleGoToStore = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  if (totalCalls === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg">
              <Icon name="monitoring" size={16} />
            </span>
            Tool Calls (24h)
          </div>
        }
        description="Last 24 hours"
      >
        <EmptyState
          image={null}
          title="No tool calls yet"
          description="Start using MCP connections to see tool call activity here."
          actions={
            <button
              onClick={handleGoToStore}
              className="text-sm text-primary hover:underline"
            >
              Browse Store
            </button>
          }
        />
      </HomeGridCell>
    );
  }

  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="monitoring" size={16} />
          </span>
          Tool Calls (24h)
        </div>
      }
      description="Last 24 hours"
      action={
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">
            {totalCalls.toLocaleString()}
          </span>{" "}
          calls
        </div>
      }
    >
      <ChartContainer
        className="h-[200px] w-full"
        config={{
          calls: { label: "Calls", color: "var(--color-chart-1)" },
        }}
      >
        <BarChart
          data={data}
          margin={{ left: 6, right: 8, top: 24, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            padding={{ left: 20, right: 20 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tickFormatter={(v) =>
              new Date(v).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => `${v}`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const first = Array.isArray(payload) ? payload[0] : undefined;
                  const t =
                    first &&
                    typeof first === "object" &&
                    first &&
                    "payload" in first
                      ? (first as any).payload?.t
                      : undefined;
                  return typeof t === "string"
                    ? new Date(t).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                }}
              />
            }
          />
          <Bar
            dataKey="calls"
            fill="var(--color-calls)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </HomeGridCell>
  );
}

function ErrorRateKPI() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
  });

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 750, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const totalCalls = stats?.totalCalls ?? 0;
  const errorRate = stats?.errorRate ?? 0;

  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 8);

  const handleGoToStore = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  if (totalCalls === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg">
              <Icon name="error" size={16} />
            </span>
            Error Rate (24h)
          </div>
        }
        description="Last 24 hours"
      >
        <EmptyState
          image={null}
          title="No tool calls yet"
          description="Start using MCP connections to see error rate here."
          actions={
            <button
              onClick={handleGoToStore}
              className="text-sm text-primary hover:underline"
            >
              Browse Store
            </button>
          }
        />
      </HomeGridCell>
    );
  }

  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="error" size={16} />
          </span>
          Error Rate (24h)
        </div>
      }
      description="Last 24 hours"
      action={
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">
            {(errorRate * 100).toFixed(1)}%
          </span>{" "}
          errors
        </div>
      }
    >
      <ChartContainer
        className="h-[200px] w-full"
        config={{
          errorRate: {
            label: "Error Rate (%)",
            color: "var(--color-chart-2)",
          },
        }}
      >
        <BarChart
          data={data}
          margin={{ left: 6, right: 8, top: 24, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            padding={{ left: 20, right: 20 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tickFormatter={(v) =>
              new Date(v).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                formatter={(value) => [
                  `${Number(value).toFixed(1)}%`,
                  "Error Rate",
                ]}
                labelFormatter={(_, payload) => {
                  const first = Array.isArray(payload) ? payload[0] : undefined;
                  const t =
                    first &&
                    typeof first === "object" &&
                    first &&
                    "payload" in first
                      ? (first as any).payload?.t
                      : undefined;
                  return typeof t === "string"
                    ? new Date(t).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                }}
              />
            }
          />
          <Bar
            dataKey="errorRate"
            fill="var(--color-errorRate)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </HomeGridCell>
  );
}

function LatencyKPI() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: stats } = useToolCall<
    { startDate: string; endDate: string },
    MonitoringStats
  >({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: dateRange,
    scope: locator,
    staleTime: 60_000,
  });

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 750, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const totalCalls = stats?.totalCalls ?? 0;
  const avgDurationMs = stats?.avgDurationMs ?? 0;

  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 8);

  const handleGoToStore = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  if (totalCalls === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg">
              <Icon name="speed" size={16} />
            </span>
            Latency (24h)
          </div>
        }
        description="Last 24 hours"
      >
        <EmptyState
          image={null}
          title="No tool calls yet"
          description="Start using MCP connections to see latency metrics here."
          actions={
            <button
              onClick={handleGoToStore}
              className="text-sm text-primary hover:underline"
            >
              Browse Store
            </button>
          }
        />
      </HomeGridCell>
    );
  }

  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="speed" size={16} />
          </span>
          Latency (24h)
        </div>
      }
      description="Last 24 hours"
      action={
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">
            {Math.round(avgDurationMs)}ms
          </span>{" "}
          avg
        </div>
      }
    >
      <ChartContainer
        className="h-[200px] w-full"
        config={{
          p95: { label: "p95 (ms)", color: "var(--color-chart-3)" },
        }}
      >
        <BarChart
          data={data}
          margin={{ left: 6, right: 8, top: 24, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            padding={{ left: 20, right: 20 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tickFormatter={(v) =>
              new Date(v).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => `${v}ms`}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                formatter={(value) => [`${value}ms`, "p95"]}
                labelFormatter={(_, payload) => {
                  const first = Array.isArray(payload) ? payload[0] : undefined;
                  const t =
                    first &&
                    typeof first === "object" &&
                    first &&
                    "payload" in first
                      ? (first as any).payload?.t
                      : undefined;
                  return typeof t === "string"
                    ? new Date(t).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                }}
              />
            }
          />
          <Bar dataKey="p95" fill="var(--color-p95)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </HomeGridCell>
  );
}

function ToolCallsKPISkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="monitoring" size={16} />
          </span>
          Tool Calls (24h)
        </div>
      }
      description="Last 24 hours"
      action={<div className="h-4 w-20 rounded bg-muted animate-pulse" />}
    >
      <div className="h-[200px] w-full rounded bg-muted animate-pulse" />
    </HomeGridCell>
  );
}

function ErrorRateKPISkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="error" size={16} />
          </span>
          Error Rate (24h)
        </div>
      }
      description="Last 24 hours"
      action={<div className="h-4 w-20 rounded bg-muted animate-pulse" />}
    >
      <div className="h-[200px] w-full rounded bg-muted animate-pulse" />
    </HomeGridCell>
  );
}

function LatencyKPISkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="speed" size={16} />
          </span>
          Latency (24h)
        </div>
      }
      description="Last 24 hours"
      action={<div className="h-4 w-20 rounded bg-muted animate-pulse" />}
    >
      <div className="h-[200px] w-full rounded bg-muted animate-pulse" />
    </HomeGridCell>
  );
}

export const MonitoringKPIs = {
  ToolCalls: Object.assign(ToolCallsKPI, {
    Skeleton: ToolCallsKPISkeleton,
  }),
  ErrorRate: Object.assign(ErrorRateKPI, {
    Skeleton: ErrorRateKPISkeleton,
  }),
  Latency: Object.assign(LatencyKPI, {
    Skeleton: LatencyKPISkeleton,
  }),
};

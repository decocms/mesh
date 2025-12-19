import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Bar, BarChart, Cell } from "recharts";
import { HomeGridCell } from "./home-grid-cell.tsx";
import type { MonitoringStats } from "./monitoring-types.ts";

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
  const { locator } = useProjectContext();
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

  const mockData = Array.from({ length: 24 }, (_, i) => ({
    ts: Date.now() - (23 - i) * 3600000,
    calls: Math.floor(Math.random() * 50) + 10,
  }));

  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 24);

  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (totalCalls === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Tool Calls (24h)</p>
            <p className="text-lg font-medium">1,247</p>
          </div>
        }
      >
        <div className="flex flex-col gap-2 w-full">
          <ChartContainer
            className="h-[103px] w-full"
            config={{
              calls: { label: "Calls", color: "var(--chart-2)" },
            }}
          >
            <BarChart
              data={mockData}
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
            >
              <Bar
                dataKey="calls"
                fill="var(--chart-2)"
                radius={[0, 0, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
          <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
            <p>{formatDate(startDate)}</p>
            <p>{formatDate(endDate)}</p>
          </div>
        </div>
      </HomeGridCell>
    );
  }

  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Tool Calls (24h)</p>
          <p className="text-lg font-medium">{totalCalls.toLocaleString()}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <ChartContainer
          className="h-[103px] w-full"
          config={{
            calls: { label: "Calls", color: "var(--color-chart-1)" },
          }}
        >
          <BarChart
            data={data}
            margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
          >
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const first = Array.isArray(payload)
                      ? payload[0]
                      : undefined;
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
              fill="var(--color-chart-2)"
              radius={[0, 0, 0, 0]}
              minPointSize={1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.calls === 0
                      ? "var(--muted-foreground)"
                      : "var(--chart-2)"
                  }
                  fillOpacity={entry.calls === 0 ? 0.25 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
          <p>{formatDate(startDate)}</p>
          <p>{formatDate(endDate)}</p>
        </div>
      </div>
    </HomeGridCell>
  );
}

function ErrorRateKPI() {
  const { locator } = useProjectContext();
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
  const totalErrors = logs.filter((log) => log.isError).length;

  const mockData = Array.from({ length: 24 }, (_, i) => ({
    ts: Date.now() - (23 - i) * 3600000,
    errors: Math.floor(Math.random() * 10),
  }));

  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 24);

  if (totalCalls === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Errors (24h)</p>
            <p className="text-lg font-medium">23</p>
          </div>
        }
      >
        <div className="flex flex-col gap-2 w-full">
          <ChartContainer
            className="h-[103px] w-full"
            config={{
              errors: { label: "Errors", color: "var(--chart-5)" },
            }}
          >
            <BarChart
              data={mockData}
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
            >
              <Bar
                dataKey="errors"
                fill="var(--chart-5)"
                radius={[0, 0, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
          <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
            <p>Dec 17</p>
            <p>Dec 18</p>
          </div>
        </div>
      </HomeGridCell>
    );
  }
  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Errors (24h)</p>
          <p className="text-lg font-medium">{totalErrors.toLocaleString()}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <ChartContainer
          className="h-[103px] w-full"
          config={{
            errors: {
              label: "Errors",
              color: "var(--color-chart-3)",
            },
          }}
        >
          <BarChart
            data={data}
            margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
          >
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const first = Array.isArray(payload)
                      ? payload[0]
                      : undefined;
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
              dataKey="errors"
              fill="var(--color-chart-5)"
              radius={[0, 0, 0, 0]}
              minPointSize={1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.errors === 0
                      ? "var(--muted-foreground)"
                      : "var(--chart-5)"
                  }
                  fillOpacity={entry.errors === 0 ? 0.25 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
          <p>{formatDate(startDate)}</p>
          <p>{formatDate(endDate)}</p>
        </div>
      </div>
    </HomeGridCell>
  );
}

function LatencyKPI() {
  const { locator } = useProjectContext();
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

  const mockData = Array.from({ length: 24 }, (_, i) => ({
    ts: Date.now() - (23 - i) * 3600000,
    p95: Math.floor(Math.random() * 500) + 100,
  }));

  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 24);

  if (totalCalls === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">AVG. Latency (24h)</p>
            <p className="text-lg font-medium">234ms</p>
          </div>
        }
      >
        <div className="flex flex-col gap-2 w-full">
          <ChartContainer
            className="h-[103px] w-full"
            config={{
              p95: { label: "p95 (ms)", color: "var(--chart-3)" },
            }}
          >
            <BarChart
              data={mockData}
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
            >
              <Bar dataKey="p95" fill="var(--chart-3)" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
            <p>Dec 17</p>
            <p>Dec 18</p>
          </div>
        </div>
      </HomeGridCell>
    );
  }

  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">AVG. Latency (24h)</p>
          <p className="text-lg font-medium">{Math.round(avgDurationMs)}ms</p>
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <ChartContainer
          className="h-[103px] w-full"
          config={{
            p95: { label: "p95 (ms)", color: "var(--color-chart-4)" },
          }}
        >
          <BarChart
            data={data}
            margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
          >
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const first = Array.isArray(payload)
                      ? payload[0]
                      : undefined;
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
              dataKey="p95"
              fill="var(--color-chart-3)"
              radius={[0, 0, 0, 0]}
              minPointSize={1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.p95 === 0
                      ? "var(--muted-foreground)"
                      : "var(--chart-3)"
                  }
                  fillOpacity={entry.p95 === 0 ? 0.25 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
          <p>{formatDate(startDate)}</p>
          <p>{formatDate(endDate)}</p>
        </div>
      </div>
    </HomeGridCell>
  );
}

function ToolCallsKPISkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1">
          <div className="h-5 w-20 rounded bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="h-[103px] w-full rounded bg-muted animate-pulse" />
        <div className="flex items-start justify-between">
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </HomeGridCell>
  );
}

function ErrorRateKPISkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1">
          <div className="h-5 w-16 rounded bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="h-[103px] w-full rounded bg-muted animate-pulse" />
        <div className="flex items-start justify-between">
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </HomeGridCell>
  );
}

function LatencyKPISkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1">
          <div className="h-5 w-24 rounded bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="h-[103px] w-full rounded bg-muted animate-pulse" />
        <div className="flex items-start justify-between">
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
          <div className="h-4 w-12 rounded bg-muted animate-pulse" />
        </div>
      </div>
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

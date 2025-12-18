import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { BentoTile } from "./bento-tile";

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
  bucketCount = 10,
): BucketPoint[] {
  // Split the window into N equal buckets. This avoids long stretches of empty buckets
  // and makes the chart fill the available space nicely.
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
    // Display in local time, even though we bucket in UTC.
    label: b.label,
    calls: b.calls,
    errors: b.errors,
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

function MonitoringHeroContent() {
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 750, offset: 0 },
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  // Trim the displayed window to the actual dataset so we don't render leading/trailing empty buckets.
  // If we have no logs, fall back to the full last-24h window.
  const minMax = getMinMaxTs(logs);
  const start = minMax ? new Date(minMax.min) : new Date(dateRange.startDate);
  const end = minMax ? new Date(minMax.max) : new Date(dateRange.endDate);
  const data = buildBuckets(logs, start, end, 10);

  const totalCalls = logs.length;
  const totalErrors = logs.filter((l) => l.isError).length;

  return (
    <BentoTile
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="monitoring" size={16} />
          </span>
          Calls & Latency
        </div>
      }
      description="Last 24 hours · derived from recent monitoring logs (active window)"
      action={
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{totalCalls}</span> calls
          · <span className="font-mono text-foreground">{totalErrors}</span>{" "}
          errors
        </div>
      }
      className="lg:col-span-3"
    >
      <ChartContainer
        className="h-[260px] w-full"
        config={{
          // Theme tokens are OKLCH (not HSL), so use chart color variables directly.
          calls: { label: "Calls", color: "var(--color-chart-1)" },
          p95: { label: "p95 (ms)", color: "var(--color-chart-2)" },
        }}
      >
        <AreaChart
          data={data}
          margin={{ left: 6, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            padding={{ left: 0, right: 0 }}
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
            yAxisId="calls"
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => `${v}`}
          />
          <YAxis
            yAxisId="latency"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => `${v}ms`}
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
          <Area
            yAxisId="calls"
            type="monotone"
            dataKey="calls"
            stroke="var(--color-calls)"
            fill="var(--color-calls)"
            fillOpacity={0.14}
            strokeWidth={2}
          />
          <Line
            yAxisId="latency"
            type="monotone"
            dataKey="p95"
            stroke="var(--color-p95)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ChartContainer>
    </BentoTile>
  );
}

function MonitoringHeroSkeleton() {
  return (
    <BentoTile
      title="Calls & Latency"
      description="Last 24 hours"
      className="lg:col-span-3"
      action={<div className="h-4 w-32 rounded bg-muted animate-pulse" />}
    >
      <div className="h-[260px] w-full rounded-xl bg-muted animate-pulse" />
    </BentoTile>
  );
}

export const MonitoringHero = Object.assign(MonitoringHeroContent, {
  Skeleton: MonitoringHeroSkeleton,
});

import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Pie, PieChart, Cell } from "recharts";
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

type ToolAgg = {
  tool: string;
  calls: number;
};

function buildTopTools(logs: MonitoringLog[], limit: number): ToolAgg[] {
  const byTool = new Map<string, number>();
  for (const log of logs) {
    const key = log.toolName || "Unknown";
    byTool.set(key, (byTool.get(key) ?? 0) + 1);
  }

  return [...byTool.entries()]
    .map(([tool, calls]) => ({ tool, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, limit);
}

function truncateToolName(name: string, max = 22) {
  if (name.length <= max) return name;
  return `${name.slice(0, Math.max(0, max - 1))}…`;
}

function TopToolsContent() {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

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
  const rawTop = buildTopTools(logs, 6);
  const top = rawTop.map((t, idx) => ({
    key: `t${idx + 1}`,
    tool: t.tool,
    toolShort: truncateToolName(t.tool),
    calls: t.calls,
  }));

  const config = Object.fromEntries(
    top.map((t, idx) => [
      t.key,
      {
        label: t.tool,
        color: `var(--color-chart-${(idx % 5) + 1})`,
      },
    ]),
  ) as Record<string, { label: string; color: string }>;

  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="build" size={16} />
          </span>
          Top tools
        </div>
      }
      description="Most called tools in the last 24 hours"
      action={
        <div className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{top.length}</span> tools
        </div>
      }
    >
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-[220px_1fr] md:items-center">
        <ChartContainer
          // ChartContainer defaults to `aspect-video`, which can force the chart wider than its column.
          // We neutralize the aspect and clamp width so the legend never overflows the tile.
          className="h-[220px] w-full max-w-[220px] aspect-auto"
          config={config}
        >
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent indicator="dot" nameKey="key" />}
            />
            <Pie
              data={top}
              dataKey="calls"
              nameKey="key"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              stroke="var(--color-border)"
              strokeWidth={1}
            >
              {top.map((t) => (
                <Cell key={t.key} fill={`var(--color-${t.key})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="min-w-0 space-y-2">
          {top.map((t) => (
            <div
              key={t.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(--color-${t.key})` }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {t.toolShort}
                  </div>
                </div>
              </div>
              <div className="shrink-0 font-mono text-xs text-foreground tabular-nums">
                {t.calls}
              </div>
            </div>
          ))}
        </div>
      </div>
    </HomeGridCell>
  );
}

function TopToolsSkeleton() {
  return (
    <HomeGridCell
      title="Top tools"
      description="Most called tools in the last 24 hours"
    >
      <div className="h-[260px] w-full rounded-xl bg-muted animate-pulse" />
    </HomeGridCell>
  );
}

export const TopTools = Object.assign(TopToolsContent, {
  Skeleton: TopToolsSkeleton,
});

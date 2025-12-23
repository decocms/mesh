import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { ChartContainer, ChartTooltip } from "@deco/ui/components/chart.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Line, LineChart } from "recharts";
import { HomeGridCell } from "./home-grid-cell.tsx";
import type {
  BaseMonitoringLog,
  BaseMonitoringLogsResponse,
} from "@/web/components/monitoring";

type MetricsMode = "requests" | "errors" | "latency";

interface BucketData {
  t: string;
  ts: number;
  label: string;
  [toolName: string]: string | number;
}

function buildStackedToolBuckets(
  logs: BaseMonitoringLog[],
  start: Date,
  end: Date,
  topN: number = 10,
): {
  buckets: BucketData[];
  topTools: Array<{ name: string; connectionId?: string }>;
  chartConfig: any;
  toolColors: Map<string, string>;
} {
  const bucketCount = 24;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const bucketSizeMs = (endMs - startMs) / bucketCount;

  // First, find top N tools overall with their connection IDs
  const toolData = new Map<string, { count: number; connectionId?: string }>();
  for (const log of logs) {
    const tool = log.toolName || "Unknown";
    const existing = toolData.get(tool);
    toolData.set(tool, {
      count: (existing?.count ?? 0) + 1,
      connectionId: existing?.connectionId || log.connectionId,
    });
  }

  const topTools = [...toolData.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([name, data]) => ({ name, connectionId: data.connectionId }));

  // Create buckets
  const buckets: BucketData[] = [];
  const toolNames = topTools.map((t) => t.name);
  for (let i = 0; i < bucketCount; i++) {
    const d = new Date(startMs + i * bucketSizeMs);
    const bucket: BucketData = {
      t: d.toISOString(),
      ts: d.getTime(),
      label: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    // Initialize all top tools to 0
    for (const toolName of toolNames) {
      bucket[toolName] = 0;
    }
    buckets.push(bucket);
  }

  // Populate buckets
  for (const log of logs) {
    const ts = new Date(log.timestamp).getTime();
    const rawIdx = Math.floor((ts - startMs) / bucketSizeMs);
    const idx = Math.max(0, Math.min(bucketCount - 1, rawIdx));
    const bucket = buckets[idx];
    if (!bucket) continue;

    const tool = log.toolName || "Unknown";
    if (toolNames.includes(tool)) {
      bucket[tool] = (bucket[tool] as number) + 1;
    }
  }

  // Build chart config and color map
  const chartConfig: any = {};
  const toolColors = new Map<string, string>();
  topTools.forEach((tool, i) => {
    const colorNum = (i % 5) + 1;
    const colorVar = `var(--chart-${colorNum})`;
    toolColors.set(tool.name, colorVar);
    chartConfig[tool.name] = {
      label: tool.name,
      color: colorVar,
    };
  });

  return { buckets, topTools, chartConfig, toolColors };
}

interface TopToolsContentProps {
  metricsMode: MetricsMode;
}

function TopToolsContent(_props: TopToolsContentProps) {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();
  const connections = useConnections() ?? [];

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    BaseMonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 2000, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const start = new Date(dateRange.startDate);
  const end = new Date(dateRange.endDate);

  // Generate mock data if no logs
  const mockLogs: BaseMonitoringLog[] =
    logs.length === 0
      ? Array.from({ length: 150 }, (_, i) => ({
          id: `mock-${i}`,
          toolName:
            [
              "COLLECTION_LLM_LIST",
              "COLLECTION_REGISTRY_APP_LIST",
              "microsoft_docs_search",
              "MCP_CONFIGURATION",
            ][i % 4] || "COLLECTION_LLM_LIST",
          connectionId: `mock-conn-${i % 4}`,
          connectionTitle: "Mock Connection",
          isError: false,
          errorMessage: null,
          durationMs: Math.floor(Math.random() * 300) + 100,
          timestamp: new Date(
            start.getTime() + Math.random() * (end.getTime() - start.getTime()),
          ).toISOString(),
        }))
      : [];

  const displayLogs = logs.length === 0 ? mockLogs : logs;

  const { buckets, topTools, chartConfig, toolColors } =
    buildStackedToolBuckets(displayLogs, start, end, 10);

  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  const handleTitleClick = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
    });
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">Top Tools</p>
          <div className="flex items-center gap-3">
            {topTools.slice(0, 3).map((tool) => {
              const connection = connectionMap.get(tool.connectionId || "");
              return (
                <div key={tool.name} className="flex items-center gap-1">
                  <IntegrationIcon
                    icon={connection?.icon || null}
                    name={tool.name}
                    size="xs"
                    fallbackIcon="extension"
                    className="shrink-0 !size-4 !min-w-4 aspect-square rounded-sm"
                  />
                  <span className="text-[10px] text-foreground truncate max-w-32">
                    {tool.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      }
      onTitleClick={handleTitleClick}
    >
      {topTools.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          No tool activity in the last 24 hours
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full h-full cursor-pointer hover:opacity-80 transition-opacity">
          <ChartContainer
            className="flex-1 min-h-0 max-h-[120px] w-full"
            config={chartConfig}
          >
            <LineChart
              data={buckets}
              margin={{ left: 0, right: 0, top: 5, bottom: 5 }}
            >
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;

                  const timeLabel =
                    payload[0] &&
                    typeof payload[0] === "object" &&
                    "payload" in payload[0]
                      ? ((payload[0] as any).payload?.label ?? "")
                      : "";

                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="mb-1.5 text-xs text-muted-foreground">
                        {timeLabel}
                      </div>
                      <div className="flex flex-col gap-1">
                        {payload.map((entry: any) => {
                          if (!entry.value || entry.value === 0) return null;
                          const tool = topTools.find(
                            (t) => t.name === entry.dataKey,
                          );
                          const connection = connectionMap.get(
                            tool?.connectionId || "",
                          );
                          return (
                            <div
                              key={entry.dataKey}
                              className="flex items-center gap-1.5"
                            >
                              <div
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <IntegrationIcon
                                icon={connection?.icon || null}
                                name={entry.dataKey}
                                size="xs"
                                fallbackIcon="extension"
                                className="shrink-0"
                              />
                              <span className="text-xs font-medium">
                                {entry.dataKey}:
                              </span>
                              <span className="text-xs font-bold">
                                {entry.value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />
              {topTools.map((tool) => (
                <Line
                  key={tool.name}
                  type="monotone"
                  dataKey={tool.name}
                  stroke={toolColors.get(tool.name)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
          <div className="flex items-start justify-between text-xs text-muted-foreground w-full">
            <p>{formatDate(start)}</p>
            <p>{formatDate(end)}</p>
          </div>
        </div>
      )}
    </HomeGridCell>
  );
}

function TopToolsSkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex flex-col gap-1.5">
          <div className="h-5 w-20 rounded bg-muted animate-pulse" />
          <div className="flex items-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="size-4 aspect-square rounded-md bg-muted animate-pulse" />
                <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-2 w-full h-full">
        <div className="flex-1 min-h-0 max-h-[120px] w-full rounded bg-muted animate-pulse" />
        <div className="flex items-start justify-between w-full">
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </HomeGridCell>
  );
}

export const TopTools = {
  Content: TopToolsContent,
  Skeleton: TopToolsSkeleton,
};

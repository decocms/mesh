import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  type MonitoringLog,
  type MonitoringLogsResponse,
} from "@/web/components/monitoring/monitoring-stats-row.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@deco/ui/components/chart.tsx";
import { Pie, PieChart, Cell } from "recharts";
import { HomeGridCell } from "./home-grid-cell.tsx";

type ToolAgg = {
  tool: string;
  calls: number;
  connectionId?: string;
};

function buildTopTools(logs: MonitoringLog[], limit: number): ToolAgg[] {
  const byTool = new Map<string, { calls: number; connectionId?: string }>();
  for (const log of logs) {
    const key = log.toolName || "Unknown";
    const existing = byTool.get(key);
    byTool.set(key, {
      calls: (existing?.calls ?? 0) + 1,
      connectionId: existing?.connectionId || log.connectionId,
    });
  }

  return [...byTool.entries()]
    .map(([tool, { calls, connectionId }]) => ({
      tool,
      calls,
      connectionId,
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, limit);
}

function TopToolsContent() {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();
  const connections = useConnections() ?? [];

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
  let top = rawTop.map((t, idx) => ({
    key: `t${idx + 1}`,
    tool: t.tool,
    calls: t.calls,
    connectionId: t.connectionId,
  }));

  // Use mock data if no logs
  if (logs.length === 0) {
    top = [
      {
        key: "t1",
        tool: "COLLECTION_AGENT_LIST",
        calls: 210,
        connectionId: "mock1",
      },
      {
        key: "t2",
        tool: "COLLECTION_LLM_LIST",
        calls: 82,
        connectionId: "mock2",
      },
      {
        key: "t3",
        tool: "COLLECTION_REGISTRY_APPS_LIST",
        calls: 15,
        connectionId: "mock3",
      },
      {
        key: "t4",
        tool: "COLLECTION_REGISTRY_TOOLS_LIST",
        calls: 15,
        connectionId: "mock4",
      },
      {
        key: "t5",
        tool: "MCP_CONFIGURATION",
        calls: 8,
        connectionId: "mock5",
      },
      {
        key: "t6",
        tool: "LLM_DO_STREAM",
        calls: 1,
        connectionId: "mock6",
      },
    ];
  }

  const config = Object.fromEntries(
    top.map((t, idx) => [
      t.key,
      {
        label: t.tool,
        color: `var(--chart-${(idx % 5) + 1})`,
      },
    ]),
  ) as Record<string, { label: string; color: string }>;

  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Top Tools (24h)</p>}
      noPadding
    >
      <div className="w-full">
        {/* Chart on top */}
        <div className="flex items-center justify-center py-4 shrink-0">
          <ChartContainer
            className="h-[200px] w-[200px] aspect-auto"
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
                innerRadius={52}
                outerRadius={82}
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
        </div>

        {/* Table below */}
        <div className="w-full">
          {top.map((t) => {
            const connection = connectionMap.get(t.connectionId || "");
            return (
              <div
                key={t.key}
                className="flex items-center h-16 border-t border-border/60 hover:bg-muted/40 transition-colors"
              >
                {/* Icon with Color */}
                <div className="flex items-center w-20 pl-4 gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: config[t.key]?.color }}
                    aria-hidden="true"
                  />
                  <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                    <IntegrationIcon
                      icon={connection?.icon || null}
                      name={t.tool}
                      size="xs"
                      className="shadow-sm"
                    />
                  </div>
                </div>

                {/* Tool Name */}
                <div className="flex-1 min-w-0 px-4">
                  <span className="text-xs font-medium text-foreground truncate block">
                    {t.tool}
                  </span>
                </div>

                {/* Call count */}
                <div className="flex items-center pr-5">
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {t.calls}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </HomeGridCell>
  );
}

function TopToolsSkeleton() {
  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Top Tools (24h)</p>}
    >
      <div className="h-[260px] w-full rounded-xl bg-muted animate-pulse" />
    </HomeGridCell>
  );
}

export const TopTools = Object.assign(TopToolsContent, {
  Skeleton: TopToolsSkeleton,
});

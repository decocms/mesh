import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { useNavigate } from "@tanstack/react-router";
import { HomeGridCell } from "./home-grid-cell.tsx";
import type {
  MonitoringLog,
  MonitoringLogsResponse,
} from "./monitoring-types.ts";

type MetricsMode = "requests" | "errors" | "latency";

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

interface TopToolsContentProps {
  metricsMode: MetricsMode;
}

function TopToolsContent({ metricsMode }: TopToolsContentProps) {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();
  const connections = useConnections() ?? [];

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 2000, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const top = buildTopTools(logs, 6);

  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  const handleTitleClick = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
    });
  };

  const maxValue = top.length > 0 ? top[0].calls : 1;

  const barColor =
    metricsMode === "requests"
      ? "bg-chart-1"
      : metricsMode === "errors"
        ? "bg-chart-3"
        : "bg-chart-4";

  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Top Tools</p>}
      onTitleClick={handleTitleClick}
    >
      {top.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          No tool activity in the last 24 hours
        </div>
      ) : (
        <div className="space-y-4 w-full">
          {top.map((t, idx) => {
            const connection = connectionMap.get(t.connectionId || "");
            const percentage = maxValue > 0 ? (t.calls / maxValue) * 100 : 0;
            return (
              <div
                key={`${t.tool}-${idx}`}
                className="group cursor-pointer flex items-center gap-2"
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor: `hsl(var(--chart-${(idx % 5) + 1}))`,
                  }}
                  aria-hidden="true"
                />
                <IntegrationIcon
                  icon={connection?.icon || null}
                  name={t.tool}
                  size="xs"
                  fallbackIcon="extension"
                  className="shrink-0"
                />
                <span className="text-xs font-medium text-foreground truncate min-w-0 w-32">
                  {t.tool}
                </span>
                <div className="relative h-2 bg-muted/50 overflow-hidden flex-1">
                  <div
                    className={`h-full transition-all duration-500 ease-out group-hover:opacity-80 ${barColor}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums shrink-0 text-foreground font-normal">
                  {t.calls}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </HomeGridCell>
  );
}

function TopToolsSkeleton() {
  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Top Tools</p>}
    >
      <div className="space-y-4 w-full">
        {Array.from({ length: 5 }).map((_, i) => (
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

export const TopTools = {
  Content: TopToolsContent,
  Skeleton: TopToolsSkeleton,
};

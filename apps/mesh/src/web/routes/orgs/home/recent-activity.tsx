import { createToolCaller } from "@/tools/client";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
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

function RecentActivityContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();

  const dateRange = getLast24HoursDateRange();
  const toolInputParams = { ...dateRange, limit: 6, offset: 0 };

  const { data: logsData } = useToolCall<
    {
      startDate: string;
      endDate: string;
      limit: number;
      offset: number;
    },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];

  const handleRowClick = (log: MonitoringLog) => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: {
        connections: log.connectionId,
        tool: log.toolName,
      },
    });
  };

  const handleViewAll = () => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
    });
  };

  if (logs.length === 0) {
    return (
      <HomeGridCell
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg">
              <Icon name="history" size={16} />
            </span>
            Recent Activity
          </div>
        }
        description="Latest tool calls across your connections"
      >
        <EmptyState
          image={null}
          title="No activity yet"
          description="Tool call activity will appear here once you make your first call through an MCP connection."
          actions={
            <button
              onClick={() =>
                navigate({
                  to: "/$org/mcps",
                  params: { org: org.slug },
                })
              }
              className="text-sm text-primary hover:underline"
            >
              Browse MCPs
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
            <Icon name="history" size={16} />
          </span>
          Recent Activity
        </div>
      }
      description="Latest tool calls across your connections"
      action={
        logsData && logsData.total > logs.length ? (
          <Button variant="ghost" size="sm" onClick={handleViewAll}>
            View all
            <Icon name="chevron_right" size={16} />
          </Button>
        ) : null
      }
    >
      <div className="space-y-2">
        {logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          const badge = log.isError ? (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Error
            </Badge>
          ) : (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              OK
            </Badge>
          );

          return (
            <button
              key={log.id}
              type="button"
              onClick={() => handleRowClick(log)}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {badge}
                    <div className="font-mono text-xs text-foreground truncate">
                      {log.toolName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      on {log.connectionTitle}
                    </div>
                  </div>
                  {log.isError && log.errorMessage ? (
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {log.errorMessage}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-xs text-muted-foreground">
                    {time}
                  </div>
                  <div className="font-mono text-xs text-foreground">
                    {log.durationMs}ms
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </HomeGridCell>
  );
}

function RecentActivitySkeleton() {
  return (
    <HomeGridCell
      title="Recent Activity"
      description="Latest tool calls across your connections"
      action={<div className="h-7 w-20 rounded bg-muted animate-pulse" />}
    >
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    </HomeGridCell>
  );
}

export const RecentActivity = Object.assign(RecentActivityContent, {
  Skeleton: RecentActivitySkeleton,
});

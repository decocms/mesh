import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
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
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const connections = useConnections() ?? [];

  const dateRange = getLast24HoursDateRange();
  const toolInputParams = { ...dateRange, limit: 8, offset: 0 };

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
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];

  // Get connection info for icons
  const connectionMap = new Map(connections.map((c) => [c.id, c]));

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

  const mockLogs = [
    {
      id: "1",
      toolName: "Google Drive",
      connectionId: "mock1",
      connectionTitle: "Google Drive",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: true,
    },
    {
      id: "2",
      toolName: "Google Sheets",
      connectionId: "mock2",
      connectionTitle: "Google Sheets",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
    {
      id: "3",
      toolName: "Google Slides",
      connectionId: "mock3",
      connectionTitle: "Google Slides",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
    {
      id: "4",
      toolName: "Gmail",
      connectionId: "mock4",
      connectionTitle: "Gmail",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
    {
      id: "5",
      toolName: "Google Calendar",
      connectionId: "mock5",
      connectionTitle: "Google Calendar",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
    {
      id: "6",
      toolName: "Discord",
      connectionId: "mock6",
      connectionTitle: "Discord",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
    {
      id: "7",
      toolName: "VTEX",
      connectionId: "mock7",
      connectionTitle: "VTEX",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
    {
      id: "8",
      toolName: "Google Docs",
      connectionId: "mock8",
      connectionTitle: "Google Docs",
      timestamp: new Date().toISOString(),
      durationMs: 200,
      isError: false,
    },
  ];

  const displayLogs = logs.length === 0 ? mockLogs : logs;
  const isShowingMockData = logs.length === 0;

  const renderLogRow = (log: MonitoringLog | (typeof mockLogs)[0]) => {
    const connection = connectionMap.get(log.connectionId);
    const timestamp = new Date(log.timestamp);
    const timeStr = timestamp.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return (
      <div
        key={log.id}
        className="flex items-center h-16 border-t border-border/60 hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() =>
          !isShowingMockData && handleRowClick(log as MonitoringLog)
        }
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-16 px-4">
          <IntegrationIcon
            icon={connection?.icon || null}
            name={log.connectionTitle}
            size="xs"
            className="shadow-sm"
          />
        </div>

        {/* Tool Name */}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground truncate block">
            {log.toolName}
          </span>
        </div>

        {/* Latency + Timestamp */}
        <div className="flex items-center gap-2 px-5 text-xs whitespace-nowrap">
          <span className="text-muted-foreground">{log.durationMs}ms</span>
          <span className="text-foreground">{timeStr}</span>
        </div>

        {/* Status Badge */}
        <div className="flex items-center pr-5">
          <Badge
            variant={log.isError ? "destructive" : "success"}
            className="text-xs px-2 py-1"
          >
            {log.isError ? "Error" : "OK"}
          </Badge>
        </div>
      </div>
    );
  };

  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Recent Activity</p>}
      action={
        logsData && logsData.total > logs.length ? (
          <Button variant="ghost" size="sm" onClick={handleViewAll}>
            See all
            <Icon name="chevron_right" size={16} />
          </Button>
        ) : null
      }
      noPadding
    >
      <div className={`w-full h-full overflow-auto ${""}`}>
        {displayLogs.map((log) => renderLogRow(log))}
      </div>
    </HomeGridCell>
  );
}

function RecentActivitySkeleton() {
  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Recent Activity</p>}
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

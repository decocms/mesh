import { createToolCaller } from "@/tools/client";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { Badge } from "@deco/ui/components/badge.tsx";
import { useNavigate } from "@tanstack/react-router";
import { HomeGridCell } from "./home-grid-cell.tsx";
import type {
  MonitoringLog,
  MonitoringLogsResponse,
} from "./monitoring-types.ts";

function RecentActivityContent() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const connections = useConnections() ?? [];

  const dateRange = getLast24HoursDateRange();
  const toolInputParams = { ...dateRange, limit: 10, offset: 0 };

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
        connectionId: [log.connectionId],
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

  const mockTools = [
    "Google Drive",
    "Google Sheets",
    "Google Slides",
    "Gmail",
    "Google Calendar",
    "Discord",
    "VTEX",
    "Google Docs",
    "Slack",
    "Notion",
    "GitHub",
    "Linear",
  ];

  const mockLogs: Array<{
    id: string;
    toolName: string;
    connectionId: string;
    connectionTitle: string;
    timestamp: string;
    durationMs: number;
    isError: boolean;
  }> = Array.from({ length: 10 }, (_, i) => {
    const timestamp = new Date(Date.now() - i * 60000); // 1 minute apart
    const toolName = mockTools[i % mockTools.length] ?? "Unknown";
    return {
      id: `mock-${i}`,
      toolName,
      connectionId: `mock${i}`,
      connectionTitle: toolName,
      timestamp: timestamp.toISOString(),
      durationMs: Math.floor(Math.random() * 500) + 100,
      isError: Math.random() > 0.9,
    };
  });

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
      onTitleClick={handleViewAll}
      noPadding
      className="min-h-0 overflow-hidden"
    >
      <div className="overflow-auto">
        {displayLogs.map((log) => renderLogRow(log))}
      </div>
    </HomeGridCell>
  );
}

function RecentActivitySkeleton() {
  return (
    <HomeGridCell
      title={<p className="text-sm text-muted-foreground">Recent Activity</p>}
      noPadding
      className="min-h-0 overflow-hidden"
    >
      <div className="overflow-auto">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="flex items-center h-16 border-t border-border/60"
          >
            <div className="flex items-center justify-center w-16 px-4">
              <div className="h-6 w-6 bg-muted animate-pulse rounded-md" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex items-center gap-2 px-5">
              <div className="h-3 w-12 bg-muted animate-pulse rounded" />
              <div className="h-3 w-40 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex items-center pr-5">
              <div className="h-6 w-12 bg-muted animate-pulse rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </HomeGridCell>
  );
}

export const RecentActivity = {
  Content: RecentActivityContent,
  Skeleton: RecentActivitySkeleton,
};

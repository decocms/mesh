import { createToolCaller } from "@/tools/client";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import { useNavigate } from "@tanstack/react-router";

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
  const toolInputParams = {
    ...dateRange,
    limit: 20,
    offset: 0,
  };

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
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-foreground">
            Recent Activity
          </h2>
        </div>
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
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-foreground">Recent Activity</h2>
        {logsData && logsData.total > logs.length && (
          <button
            onClick={handleViewAll}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all
            <Icon name="chevron_right" size={16} />
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Time</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[200px]">Tool</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead className="w-[100px] text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow
                key={log.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(log)}
              >
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </TableCell>
                <TableCell>
                  {log.isError ? (
                    <Badge
                      variant="destructive"
                      className="text-xs px-1.5 py-0"
                    >
                      Error
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs px-1.5 py-0">
                      OK
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs truncate">
                  {log.toolName}
                </TableCell>
                <TableCell className="text-sm truncate">
                  {log.connectionTitle}
                </TableCell>
                <TableCell className="text-xs text-right font-mono">
                  {log.durationMs}ms
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function RecentActivitySkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-32 bg-muted rounded animate-pulse" />
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </Card>
  );
}

export const RecentActivity = Object.assign(RecentActivityContent, {
  Skeleton: RecentActivitySkeleton,
});

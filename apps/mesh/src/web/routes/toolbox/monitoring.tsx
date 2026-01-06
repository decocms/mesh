/**
 * Toolbox Monitoring Page
 *
 * Displays monitoring logs filtered to this toolbox's traffic.
 * Uses the same monitoring components but pre-filtered by toolbox ID.
 */

import { createToolCaller } from "@/tools/client";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { MONITORING_CONFIG } from "@/web/components/monitoring/config.ts";
import { LogRow } from "@/web/components/monitoring/log-row.tsx";
import {
  MonitoringStatsRow,
  MonitoringStatsRowSkeleton,
  calculateStats,
  type DateRange,
} from "@/web/components/monitoring/monitoring-stats-row.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useInfiniteScroll } from "@/web/hooks/use-infinite-scroll.ts";
import { useMembers } from "@/web/hooks/use-members";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useToolboxContext } from "@/web/providers/toolbox-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { PauseCircle, PlayCircle } from "@untitledui/icons";
import {
  TimeRangePicker,
  type TimeRange as TimeRangeValue,
} from "@deco/ui/components/time-range-picker.tsx";
import { expressionToDate } from "@deco/ui/lib/time-expressions.ts";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import {
  type EnrichedMonitoringLog,
  type MonitoringLogsResponse,
} from "@/web/components/monitoring";

// ============================================================================
// Stats Component
// ============================================================================

interface MonitoringStatsProps {
  displayDateRange: DateRange;
  logs: MonitoringLogsResponse["logs"];
  total?: number;
}

function MonitoringStatsContent({
  displayDateRange,
  logs,
  total,
}: MonitoringStatsProps) {
  const stats = calculateStats(logs, displayDateRange, undefined, total);

  return (
    <MonitoringStatsRow
      stats={stats}
      chartHeight="h-[30px] md:h-[40px]"
      compact
    />
  );
}

const MonitoringStats = Object.assign(MonitoringStatsContent, {
  Skeleton: MonitoringStatsRowSkeleton,
});

// ============================================================================
// Logs Table Component
// ============================================================================

interface MonitoringLogsTableProps {
  search: string;
  logs: MonitoringLogsResponse["logs"];
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  connections: ReturnType<typeof useConnections>;
  gateways: ReturnType<typeof useGateways>;
  membersData: ReturnType<typeof useMembers>["data"];
}

function MonitoringLogsTableContent({
  search: searchQuery,
  logs,
  hasMore,
  onLoadMore,
  isLoadingMore,
  connections: connectionsData,
  gateways: gatewaysData,
  membersData,
}: MonitoringLogsTableProps) {
  const connections = connectionsData ?? [];
  const gateways = gatewaysData ?? [];
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const lastLogRef = useInfiniteScroll(onLoadMore, hasMore, isLoadingMore);

  const members = membersData?.data?.members ?? [];
  const userMap = new Map(members.map((m) => [m.userId, m.user]));
  const gatewayMap = new Map(gateways.map((g) => [g.id, g]));

  const enrichedLogs: EnrichedMonitoringLog[] = logs.map((log) => {
    const user = userMap.get(log.userId ?? "");
    const gateway = log.gatewayId ? gatewayMap.get(log.gatewayId) : null;
    return {
      ...log,
      userName: user?.name ?? log.userId ?? "Unknown",
      userImage: user?.image,
      gatewayName: gateway?.title ?? null,
    };
  });

  // Filter by search query
  let filteredLogs = enrichedLogs;
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    filteredLogs = filteredLogs.filter(
      (log) =>
        log.toolName.toLowerCase().includes(lowerQuery) ||
        log.connectionTitle.toLowerCase().includes(lowerQuery) ||
        log.errorMessage?.toLowerCase().includes(lowerQuery),
    );
  }

  const toggleRow = (log: EnrichedMonitoringLog) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(log.id)) {
        next.delete(log.id);
      } else {
        next.add(log.id);
      }
      return next;
    });
  };

  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  if (filteredLogs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          image={
            <img
              src="/empty-state-logs.svg"
              alt=""
              width={336}
              height={320}
              aria-hidden="true"
            />
          }
          title="No logs found"
          description={
            searchQuery
              ? "No logs match your search"
              : "No logs found in this time range"
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="min-w-[600px] md:min-w-0 bg-background">
          {/* Table Header */}
          <div className="flex items-center h-9 border-b border-border sticky top-0 z-20 before:absolute before:inset-0 before:bg-background before:z-[-1] after:absolute after:inset-0 after:bg-muted/30 after:z-[-1]">
            <div className="w-10 md:w-12 px-2 md:px-4" />
            <div className="w-12 md:w-16 px-2 md:px-4" />
            <div className="flex-1 pr-2 md:pr-4 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Tool / Connection
            </div>
            <div className="w-20 md:w-24 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              User
            </div>
            <div className="w-24 md:w-36 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Date
            </div>
            <div className="w-16 md:w-20 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Duration
            </div>
            <div className="w-16 md:w-20 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide text-right">
              Status
            </div>
          </div>

          {/* Table Rows */}
          {filteredLogs.map((log, index) => {
            const connectionInfo = connectionMap.get(log.connectionId);
            const gateway = log.gatewayId
              ? gatewayMap.get(log.gatewayId)
              : null;
            const isExpanded = expandedRows.has(log.id);
            const isFirst = index === 0;
            const isLast = index === filteredLogs.length - 1;

            return (
              <LogRow
                key={log.id}
                log={log}
                isFirst={isFirst}
                isExpanded={isExpanded}
                connection={connectionInfo}
                gatewayName={gateway?.title ?? ""}
                onToggle={() => toggleRow(log)}
                lastLogRef={isLast ? lastLogRef : undefined}
              />
            );
          })}

          {isLoadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm text-muted-foreground">
                Loading more...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MonitoringLogsTableSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading logs...</div>
    </div>
  );
}

const MonitoringLogsTable = Object.assign(MonitoringLogsTableContent, {
  Skeleton: MonitoringLogsTableSkeleton,
});

// ============================================================================
// Main Dashboard Component
// ============================================================================

function ToolboxMonitoringContent() {
  const { toolbox } = useToolboxContext();
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();

  // Local state for time range and streaming
  const [from, setFrom] = useState("now-24h");
  const [to, setTo] = useState("now");
  const [streaming, setStreaming] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Get all connections, gateways, and members
  const allConnections = useConnections();
  const allGateways = useGateways();
  const { data: membersData } = useMembers();

  // Calculate date range from expressions
  const fromResult = expressionToDate(from);
  const toResult = expressionToDate(to);

  const startDate =
    fromResult.date || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const originalEndDate = toResult.date || new Date();

  const displayDateRange = { startDate, endDate: originalEndDate };

  let fetchEndDate = originalEndDate;
  if (streaming && to === "now") {
    fetchEndDate = new Date(originalEndDate);
    fetchEndDate.setHours(fetchEndDate.getHours() + 1);
  }
  const dateRange = { startDate, endDate: fetchEndDate };

  const { pageSize, streamingRefetchInterval } = MONITORING_CONFIG;

  // Base params - filtered by this toolbox's ID
  const baseParams = {
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    gatewayId: toolbox.id,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery({
      queryKey: KEYS.monitoringLogsInfinite(
        locator,
        JSON.stringify({ ...baseParams, toolboxScope: true }),
      ),
      queryFn: async ({ pageParam = 0 }) => {
        const result = await toolCaller("MONITORING_LOGS_LIST", {
          ...baseParams,
          limit: pageSize,
          offset: pageParam,
        });
        return result as MonitoringLogsResponse;
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        if ((lastPage?.logs?.length ?? 0) < pageSize) {
          return undefined;
        }
        return allPages.length * pageSize;
      },
      staleTime: 0,
      refetchInterval: streaming ? streamingRefetchInterval : false,
    });

  const allLogs = data?.pages.flatMap((page) => page?.logs ?? []) ?? [];
  const total = data?.pages[0]?.total;

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleTimeRangeChange = (range: TimeRangeValue) => {
    setFrom(range.from);
    setTo(range.to);
  };

  return (
    <>
      <CollectionHeader
        title="Monitoring"
        ctaButton={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={streaming ? "secondary" : "outline"}
              size="sm"
              className={`h-7 px-2 sm:px-3 gap-1.5 ${streaming ? "bg-muted hover:bg-muted/80" : ""}`}
              onClick={() => setStreaming(!streaming)}
            >
              {streaming ? (
                <PauseCircle size={16} className="animate-pulse" />
              ) : (
                <PlayCircle size={16} />
              )}
              <span className="hidden sm:inline">
                {streaming ? "Streaming" : "Stream"}
              </span>
            </Button>

            <TimeRangePicker
              value={{ from, to }}
              onChange={handleTimeRangeChange}
            />
          </div>
        }
      />

      <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden">
        <MonitoringStats
          displayDateRange={displayDateRange}
          logs={allLogs}
          total={total}
        />

        <CollectionSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by tool name, connection, or error..."
          className="border-t"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearchQuery("");
              (event.target as HTMLInputElement).blur();
            }
          }}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <MonitoringLogsTable
            search={searchQuery}
            logs={allLogs}
            hasMore={hasNextPage ?? false}
            onLoadMore={handleLoadMore}
            isLoadingMore={isFetchingNextPage}
            connections={allConnections}
            gateways={allGateways}
            membersData={membersData}
          />
        </div>
      </div>
    </>
  );
}

export default function ToolboxMonitoring() {
  return (
    <CollectionPage>
      <ErrorBoundary
        fallback={
          <>
            <CollectionHeader title="Monitoring" />
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="Failed to load logs"
                description="There was an error loading the monitoring data."
              />
            </div>
          </>
        }
      >
        <Suspense
          fallback={
            <>
              <CollectionHeader title="Monitoring" />
              <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden">
                <MonitoringStats.Skeleton />
                <MonitoringLogsTable.Skeleton />
              </div>
            </>
          }
        >
          <ToolboxMonitoringContent />
        </Suspense>
      </ErrorBoundary>
    </CollectionPage>
  );
}

/**
 * Monitoring Dashboard Route
 *
 * Displays tool call monitoring logs and statistics for the organization.
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
import type {
  EnrichedMonitoringLog,
  MonitoringLog,
  MonitoringLogsResponse,
  MonitoringSearchParams,
} from "@/web/components/monitoring/types.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useInfiniteScroll } from "@/web/hooks/use-infinite-scroll.ts";
import { useMembers } from "@/web/hooks/use-members";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { MultiSelect } from "@deco/ui/components/multi-select.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import {
  TimeRangePicker,
  type TimeRange as TimeRangeValue,
} from "@deco/ui/components/time-range-picker.tsx";
import { expressionToDate } from "@deco/ui/lib/time-expressions.ts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, useState } from "react";

// ============================================================================
// Stats Component
// ============================================================================

interface MonitoringStatsProps {
  displayDateRange: DateRange;
  connectionIds: string[];
  logsData: MonitoringLogsResponse;
}

function MonitoringStatsContent({
  displayDateRange,
  connectionIds,
  logsData,
}: MonitoringStatsProps) {
  // Filter logs by multiple connection IDs (client-side if more than one selected)
  let logs = logsData?.logs ?? [];
  if (connectionIds.length > 1) {
    logs = logs.filter((log) => connectionIds.includes(log.connectionId));
  }

  // Use server total for stats calculation (logs are paginated, so we need the total)
  const totalCalls = connectionIds.length > 1 ? undefined : logsData?.total;
  const stats = calculateStats(logs, displayDateRange, undefined, totalCalls);

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
// Filters Popover Component
// ============================================================================

interface FiltersPopoverProps {
  connectionIds: string[];
  tool: string;
  status: string;
  connectionOptions: Array<{ value: string; label: string }>;
  activeFiltersCount: number;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
}

function FiltersPopover({
  connectionIds,
  tool,
  status,
  connectionOptions,
  activeFiltersCount,
  onUpdateFilters,
}: FiltersPopoverProps) {
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  return (
    <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-3 gap-1.5">
          <Icon name="filter_list" size={16} />
          Filters
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px]">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-3">Filter Logs</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Connections
              </label>
              <MultiSelect
                options={connectionOptions}
                defaultValue={connectionIds}
                onValueChange={(values) =>
                  onUpdateFilters({ connections: values.join(",") })
                }
                placeholder="All connections"
                variant="secondary"
                className="w-full"
                maxCount={2}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tool Name
              </label>
              <Input
                placeholder="Filter by tool..."
                value={tool}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onUpdateFilters({ tool: e.target.value })
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Status
              </label>
              <Select
                value={status}
                onValueChange={(value: string) =>
                  onUpdateFilters({
                    status: value as MonitoringSearchParams["status"],
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success Only</SelectItem>
                  <SelectItem value="errors">Errors Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onUpdateFilters({
                  connections: "",
                  tool: "",
                  status: "all",
                });
                setFilterPopoverOpen(false);
              }}
            >
              Clear all filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Logs Table Component
// ============================================================================

interface MonitoringLogsTableProps {
  connectionIds: string[];
  tool: string;
  status: string;
  search: string;
  pageSize: number;
  page: number;
  logsData: MonitoringLogsResponse;
  onPageChange: (page: number) => void;
  connections: ReturnType<typeof useConnections>;
  gateways: ReturnType<typeof useGateways>;
  membersData: ReturnType<typeof useMembers>["data"];
}

function MonitoringLogsTableContent({
  connectionIds,
  tool,
  status,
  search: searchQuery,
  pageSize,
  page,
  logsData,
  onPageChange,
  connections: connectionsData,
  gateways: gatewaysData,
  membersData,
}: MonitoringLogsTableProps) {
  const connections = connectionsData ?? [];
  const gateways = gatewaysData ?? [];
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Get logs from the current page
  const logs = logsData?.logs ?? [];

  // Check if there are more pages available
  const hasMore = logs.length >= pageSize;

  // Use the infinite scroll hook
  const lastLogRef = useInfiniteScroll(() => onPageChange(page + 1), hasMore);

  const members = membersData?.data?.members ?? [];
  const userMap = new Map(members.map((m) => [m.userId, m.user]));

  // Create gateway lookup map
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

  // Filter logs by search query and multiple connections (client-side)
  let filteredLogs = enrichedLogs;

  // Filter by multiple connection IDs (if more than one selected)
  if (connectionIds.length > 1) {
    filteredLogs = filteredLogs.filter((log) =>
      connectionIds.includes(log.connectionId),
    );
  }

  // Filter by search query
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    filteredLogs = filteredLogs.filter(
      (log) =>
        log.toolName.toLowerCase().includes(lowerQuery) ||
        log.connectionTitle.toLowerCase().includes(lowerQuery) ||
        log.errorMessage?.toLowerCase().includes(lowerQuery),
    );
  }

  const toggleRow = (log: MonitoringLog) => {
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

  // Get connection info for icons
  const connectionMap = new Map(connections.map((c) => [c.id, c]));

  if (filteredLogs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="No logs found"
          description={
            searchQuery || connectionIds.length > 0 || tool || status !== "all"
              ? "No logs match your filters"
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
            {/* Expand Icon Column */}
            <div className="w-10 md:w-12 px-2 md:px-4" />

            {/* Connection Icon Column */}
            <div className="w-5" />

            {/* Tool/Connection Column */}
            <div className="flex-1 pr-2 md:pr-4 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Tool / MCP Server
            </div>

            {/* User name Column */}
            <div className="w-20 md:w-24 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              User Name
            </div>

            {/* Gateway Column */}
            <div className="w-20 md:w-28 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Gateway
            </div>

            {/* Date Column */}
            <div className="w-20 md:w-24 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Date
            </div>

            {/* Time Column */}
            <div className="w-20 md:w-28 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Time
            </div>

            {/* Duration Column */}
            <div className="w-16 md:w-20 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide text-right">
              Latency
            </div>

            {/* Status Column */}
            <div className="w-16 md:w-24 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide text-right pr-3 md:pr-5">
              Status
            </div>
          </div>

          {/* Table Body */}
          {filteredLogs.map((log, index) => (
            <LogRow
              key={log.id}
              log={log}
              isFirst={index === 0}
              isExpanded={expandedRows.has(log.id)}
              connection={connectionMap.get(log.connectionId)}
              onToggle={() => toggleRow(log)}
              lastLogRef={
                index === filteredLogs.length - 1 ? lastLogRef : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonitoringLogsTableSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-muted-foreground">Loading logs...</div>
    </div>
  );
}

const MonitoringLogsTable = Object.assign(MonitoringLogsTableContent, {
  Skeleton: MonitoringLogsTableSkeleton,
});

// ============================================================================
// Main Dashboard Component
// ============================================================================

interface MonitoringDashboardContentProps {
  dateRange: DateRange;
  displayDateRange: DateRange;
  connectionIds: string[];
  tool: string;
  status: string;
  search: string;
  streaming: boolean;
  activeFiltersCount: number;
  from: string;
  to: string;
  page: number;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
  onTimeRangeChange: (range: TimeRangeValue) => void;
  onStreamingToggle: () => void;
}

function MonitoringDashboardContent({
  dateRange,
  displayDateRange,
  connectionIds,
  tool,
  status,
  search: searchQuery,
  streaming: isStreaming,
  activeFiltersCount,
  from,
  to,
  page,
  onUpdateFilters,
  onTimeRangeChange,
  onStreamingToggle,
}: MonitoringDashboardContentProps) {
  // Get all connections, gateways, and members - moved here because these hooks suspend
  const allConnections = useConnections();
  const allGateways = useGateways();
  const { data: membersData } = useMembers();
  const connectionOptions = (allConnections ?? []).map((conn) => ({
    value: conn.id,
    label: conn.title || conn.id,
  }));

  const { pageSize, streamingRefetchInterval } = MONITORING_CONFIG;
  const offset = page * pageSize;

  // Single fetch for current page logs
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();

  const logsParams = {
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    // Only pass single connection to API; multi-connection is filtered client-side
    connectionId: connectionIds.length === 1 ? connectionIds[0] : undefined,
    toolName: tool || undefined,
    isError:
      status === "errors" ? true : status === "success" ? false : undefined,
    limit: pageSize,
    offset,
  };

  const { data: logsData } = useToolCall<
    typeof logsParams,
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: logsParams,
    scope: locator,
    staleTime: 0,
    refetchInterval: isStreaming ? streamingRefetchInterval : false,
  });

  const handlePageChange = (newPage: number) => {
    onUpdateFilters({ page: newPage });
  };

  return (
    <>
      <CollectionHeader
        title="Monitoring"
        ctaButton={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filters Button */}
            <FiltersPopover
              connectionIds={connectionIds}
              tool={tool}
              status={status}
              connectionOptions={connectionOptions}
              activeFiltersCount={activeFiltersCount}
              onUpdateFilters={onUpdateFilters}
            />

            {/* Streaming Toggle */}
            <Button
              variant={isStreaming ? "secondary" : "outline"}
              size="sm"
              className={`h-7 px-2 sm:px-3 gap-1.5 ${isStreaming ? "bg-muted hover:bg-muted/80" : ""}`}
              onClick={onStreamingToggle}
            >
              <Icon
                name={isStreaming ? "pause" : "play_arrow"}
                size={16}
                className={isStreaming ? "animate-pulse" : ""}
              />
              <span className="hidden sm:inline">
                {isStreaming ? "Streaming" : "Stream"}
              </span>
            </Button>

            {/* Time Range Picker */}
            <TimeRangePicker
              value={{ from, to }}
              onChange={onTimeRangeChange}
            />
          </div>
        }
      />

      <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden">
        {/* Stats Banner */}
        <MonitoringStats
          displayDateRange={displayDateRange}
          connectionIds={connectionIds}
          logsData={logsData}
        />

        {/* Search Bar */}
        <CollectionSearch
          value={searchQuery}
          onChange={(value) => onUpdateFilters({ search: value })}
          placeholder="Search by tool name, connection, or error..."
          className="border-t"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onUpdateFilters({ search: "" });
              (event.target as HTMLInputElement).blur();
            }
          }}
        />

        {/* Logs Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <MonitoringLogsTable
            connectionIds={connectionIds}
            tool={tool}
            status={status}
            search={searchQuery}
            pageSize={pageSize}
            page={page}
            logsData={logsData}
            onPageChange={handlePageChange}
            connections={allConnections}
            gateways={allGateways}
            membersData={membersData}
          />
        </div>
      </div>
    </>
  );
}

export default function MonitoringDashboard() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const search = useSearch({
    from: "/shell/$org/monitoring",
  });

  const {
    from,
    to,
    connections,
    tool,
    search: searchQuery,
    status,
    page = 0,
    streaming = true,
  } = search;

  // Get filters from URL - defaults are handled by router schema
  const connectionIds = connections ? connections.split(",") : [];

  // Update URL with new filter values
  const updateFilters = (updates: Partial<MonitoringSearchParams>) => {
    // Reset page to 0 when filters change (unless page is explicitly updated)
    const shouldResetPage =
      !("page" in updates) &&
      ("from" in updates ||
        "to" in updates ||
        "connections" in updates ||
        "tool" in updates ||
        "status" in updates ||
        "search" in updates);

    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: {
        ...search,
        ...updates,
        ...(shouldResetPage && { page: 0 }),
      },
    });
  };

  // Handle time range change
  const handleTimeRangeChange = (range: TimeRangeValue) => {
    updateFilters({ from: range.from, to: range.to });
  };

  // Calculate date range from expressions
  const fromResult = expressionToDate(from);
  const toResult = expressionToDate(to);

  const startDate =
    fromResult.date || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const originalEndDate = toResult.date || new Date();

  // Original range for bucket calculations (what user selected)
  const displayDateRange = { startDate, endDate: originalEndDate };

  // Extended range for fetching logs when streaming
  let fetchEndDate = originalEndDate;
  if (streaming && to === "now") {
    fetchEndDate = new Date(originalEndDate);
    fetchEndDate.setHours(fetchEndDate.getHours() + 1);
  }
  const dateRange = { startDate, endDate: fetchEndDate };

  let activeFiltersCount = 0;
  if (connectionIds.length > 0) activeFiltersCount++;
  if (tool) activeFiltersCount++;
  if (status !== "all") activeFiltersCount++;

  return (
    <CollectionPage>
      <ErrorBoundary
        fallback={
          <>
            <CollectionHeader title="Monitoring" />
            <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-[0.5px] bg-border shrink-0 border-b">
                <div className="bg-background p-5 text-sm text-muted-foreground">
                  Failed to load monitoring data
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  title="Failed to load logs"
                  description="There was an error loading the monitoring data. Please try again."
                />
              </div>
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
          <MonitoringDashboardContent
            dateRange={dateRange}
            displayDateRange={displayDateRange}
            connectionIds={connectionIds}
            tool={tool}
            status={status}
            search={searchQuery}
            streaming={streaming}
            activeFiltersCount={activeFiltersCount}
            from={from}
            to={to}
            page={page}
            onUpdateFilters={updateFilters}
            onTimeRangeChange={handleTimeRangeChange}
            onStreamingToggle={() => updateFilters({ streaming: !streaming })}
          />
        </Suspense>
      </ErrorBoundary>
    </CollectionPage>
  );
}

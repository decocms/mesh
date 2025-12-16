/**
 * Monitoring Dashboard Route
 *
 * Displays tool call monitoring logs and statistics for the organization.
 */

import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deco/ui/components/table.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { MultiSelect } from "@deco/ui/components/multi-select.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Suspense, useState } from "react";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { ErrorBoundary } from "@/web/components/error-boundary";

// ============================================================================
// Types
// ============================================================================

interface MonitoringStats {
  totalCalls: number;
  errorCalls: number;
  avgDurationMs: number;
  errorRatePercent: number;
}

interface MonitoringLog {
  id: string;
  organizationId: string;
  userId: string | null;
  connectionId: string;
  connectionTitle: string;
  toolName: string;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
  timestamp: string;
  requestId: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
}

interface MonitoringLogsResponse {
  logs: MonitoringLog[];
  total: number;
}

type TimeRange = "24h" | "7d" | "30d";

interface MonitoringSearchParams {
  timeRange?: TimeRange;
  connections?: string; // Comma-separated connection IDs
  tool?: string;
  status?: "all" | "success" | "errors";
  search?: string;
  page?: number;
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ============================================================================
// Stats Component
// ============================================================================

interface MonitoringStatsProps {
  dateRange: DateRange;
  isStreaming: boolean;
}

function MonitoringStatsContent({
  dateRange,
  isStreaming,
}: MonitoringStatsProps) {
  const toolCaller = createToolCaller();

  const statsParams = {
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
  };

  const { data: stats } = useToolCall<typeof statsParams, MonitoringStats>({
    toolCaller,
    toolName: "MONITORING_STATS",
    toolInputParams: statsParams,
    staleTime: 0,
    refetchInterval: isStreaming ? 3000 : false,
  });

  return (
    <div className="border-b bg-muted/30 px-5 py-3 flex-shrink-0">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Total Calls</div>
          <div className="text-lg font-semibold">
            {stats?.totalCalls?.toLocaleString() || "0"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Error Rate</div>
          <div className="text-lg font-semibold">
            {`${Math.round(stats?.errorRatePercent || 0)}%`}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Avg Duration</div>
          <div className="text-lg font-semibold">
            {`${Math.round(stats?.avgDurationMs || 0)}ms`}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonitoringStatsSkeleton() {
  return (
    <div className="border-b bg-muted/30 px-5 py-3 flex-shrink-0">
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i}>
            <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

const MonitoringStats = Object.assign(MonitoringStatsContent, {
  Skeleton: MonitoringStatsSkeleton,
});

// ============================================================================
// Filters Component
// ============================================================================

interface MonitoringFiltersProps {
  searchQuery: string;
  connectionIds: string[];
  toolFilter: string;
  statusFilter: string;
  isStreaming: boolean;
  connectionOptions: Array<{ value: string; label: string }>;
  activeFiltersCount: number;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
  onToggleStreaming: () => void;
}

function MonitoringFiltersContent({
  searchQuery,
  connectionIds,
  toolFilter,
  statusFilter,
  isStreaming,
  connectionOptions,
  activeFiltersCount,
  onUpdateFilters,
  onToggleStreaming,
}: MonitoringFiltersProps) {
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  return (
    <div className="border-b bg-background px-5 py-2.5 flex-shrink-0">
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Icon
            name="search"
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onUpdateFilters({ search: e.target.value })
            }
            placeholder="Search by tool name, connection, or error..."
            className="h-9 pl-9"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onUpdateFilters({ search: "" });
                (event.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>

        {/* Filter Popover */}
        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-2 relative"
            >
              <Icon name="filter_list" size={18} />
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
                    value={toolFilter}
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
                    value={statusFilter}
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

        {/* Streaming Toggle */}
        <Button
          variant={isStreaming ? "default" : "outline"}
          size="sm"
          className="h-9 px-3 gap-2"
          onClick={onToggleStreaming}
        >
          <Icon
            name={isStreaming ? "pause" : "play_arrow"}
            size={16}
            className={isStreaming ? "animate-pulse" : ""}
          />
          {isStreaming ? "Streaming" : "Stream logs"}
        </Button>
      </div>
    </div>
  );
}

const MonitoringFilters = MonitoringFiltersContent;

// ============================================================================
// Log Row Component
// ============================================================================

interface MonitoringLogRowProps {
  log: MonitoringLog;
  isExpanded: boolean;
  onToggle: () => void;
}

function MonitoringLogRow({
  log,
  isExpanded,
  onToggle,
}: MonitoringLogRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 h-10"
        onClick={onToggle}
      >
        <TableCell className="py-2 w-[30px]">
          <Icon
            name={isExpanded ? "expand_more" : "chevron_right"}
            size={16}
            className="text-muted-foreground"
          />
        </TableCell>
        <TableCell className="py-2 text-xs text-muted-foreground font-mono w-[120px]">
          {new Date(log.timestamp).toLocaleTimeString()}
        </TableCell>
        <TableCell className="py-2 w-[80px]">
          {log.isError ? (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              Error
            </Badge>
          ) : (
            <Badge variant="default" className="text-xs px-1.5 py-0">
              OK
            </Badge>
          )}
        </TableCell>
        <TableCell className="py-2 font-mono text-xs truncate w-[200px]">
          {log.toolName}
        </TableCell>
        <TableCell className="py-2 text-sm truncate">
          {log.connectionTitle}
        </TableCell>
        <TableCell className="py-2 text-xs text-right font-mono w-[80px]">
          {log.durationMs}ms
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={6} className="py-4">
            <div className="space-y-3 text-sm">
              {log.errorMessage && (
                <div>
                  <div className="font-medium text-destructive mb-1">
                    Error Message
                  </div>
                  <div className="text-destructive font-mono text-xs bg-destructive/10 p-2 rounded">
                    {log.errorMessage}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-medium mb-1">Input</div>
                  <pre className="text-xs bg-background p-2 rounded border overflow-auto max-h-[200px]">
                    {JSON.stringify(log.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="font-medium mb-1">Output</div>
                  <pre className="text-xs bg-background p-2 rounded border overflow-auto max-h-[200px]">
                    {JSON.stringify(log.output, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium">Request ID:</span>{" "}
                  {log.requestId}
                </div>
                <div>
                  <span className="font-medium">Timestamp:</span>{" "}
                  {new Date(log.timestamp).toISOString()}
                </div>
                {log.userId && (
                  <div>
                    <span className="font-medium">User ID:</span> {log.userId}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ============================================================================
// Logs Table Component
// ============================================================================

interface MonitoringLogsTableProps {
  dateRange: DateRange;
  connectionIds: string[];
  toolFilter: string;
  statusFilter: string;
  searchQuery: string;
  page: number;
  pageSize: number;
  isStreaming: boolean;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
}

function MonitoringLogsTableContent({
  dateRange,
  connectionIds,
  toolFilter,
  statusFilter,
  searchQuery,
  page,
  pageSize,
  isStreaming,
  onUpdateFilters,
}: MonitoringLogsTableProps) {
  const toolCaller = createToolCaller();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const logsParams = {
    connectionId: connectionIds.length > 0 ? connectionIds[0] : undefined,
    toolName: toolFilter || undefined,
    isError:
      statusFilter === "errors"
        ? true
        : statusFilter === "success"
          ? false
          : undefined,
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    limit: pageSize,
    offset: page * pageSize,
  };

  const { data: logs } = useToolCall<typeof logsParams, MonitoringLogsResponse>(
    {
      toolCaller,
      toolName: "MONITORING_LOGS_LIST",
      toolInputParams: logsParams,
      staleTime: 0,
      refetchInterval: isStreaming ? 3000 : false,
    },
  );

  // Filter logs by search query and multiple connections (client-side)
  let filteredLogs = logs?.logs ?? [];

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

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (filteredLogs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {searchQuery ||
        connectionIds.length > 0 ||
        toolFilter ||
        statusFilter !== "all"
          ? "No logs match your filters"
          : "No logs found in this time range"}
      </div>
    );
  }

  return (
    <>
      {/* Table Header - Fixed */}
      <div className="flex-shrink-0 border-b">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px]"></TableHead>
              <TableHead className="w-[120px]">Time</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[200px]">Tool</TableHead>
              <TableHead className="flex-1">Connection</TableHead>
              <TableHead className="w-[80px] text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      {/* Table Body - Scrollable */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableBody>
            {filteredLogs.map((log) => (
              <MonitoringLogRow
                key={log.id}
                log={log}
                isExpanded={expandedRows.has(log.id)}
                onToggle={() => toggleRow(log.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {logs && logs.total > pageSize && (
        <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onUpdateFilters({ page: page - 1 })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {Math.ceil(logs.total / pageSize)} · {logs.total}{" "}
            total
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!logs?.logs || logs.logs.length < pageSize}
            onClick={() => onUpdateFilters({ page: page + 1 })}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}

function MonitoringLogsTableSkeleton() {
  return (
    <>
      {/* Table Header - Fixed */}
      <div className="flex-shrink-0 border-b">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px]"></TableHead>
              <TableHead className="w-[120px]">Time</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[200px]">Tool</TableHead>
              <TableHead className="flex-1">Connection</TableHead>
              <TableHead className="w-[80px] text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>

      {/* Table Body - Loading */}
      <div className="flex-1 overflow-auto">
        <div className="p-5 space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    </>
  );
}

function MonitoringLogsTableError() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium">Failed to load logs</h3>
        <p className="text-sm text-muted-foreground">
          There was an error loading the monitoring logs. Please try again.
        </p>
      </div>
    </div>
  );
}

const MonitoringLogsTable = Object.assign(MonitoringLogsTableContent, {
  Skeleton: MonitoringLogsTableSkeleton,
  Error: MonitoringLogsTableError,
});

// ============================================================================
// Main Dashboard Component
// ============================================================================

export default function MonitoringDashboard() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as MonitoringSearchParams;

  // Get all connections for the multi-select
  const allConnections = useConnections() ?? [];

  // Get filters from URL or use defaults
  const timeRange = (search.timeRange || "24h") as TimeRange;
  const connectionIds = search.connections ? search.connections.split(",") : [];
  const toolFilter = search.tool || "";
  const searchQuery = search.search || "";
  const statusFilter = search.status || "all";
  const page = search.page || 0;
  const pageSize = 50;

  // Build connection options for MultiSelect
  const connectionOptions = allConnections.map((conn) => ({
    value: conn.id,
    label: conn.title || conn.id,
  }));

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(true);

  // Update URL with new filter values
  const updateFilters = (updates: Partial<MonitoringSearchParams>) => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: { ...search, ...updates, page: updates.page ?? 0 },
    });
  };

  // Calculate date range based on time range selection
  const now = new Date();
  const startDate = new Date();

  switch (timeRange) {
    case "24h":
      startDate.setHours(now.getHours() - 24);
      break;
    case "7d":
      startDate.setDate(now.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(now.getDate() - 30);
      break;
  }

  // When streaming, set endDate 1 hour in the future to capture new logs
  const endDate = new Date(now);
  if (isStreaming) {
    endDate.setHours(endDate.getHours() + 1);
  }

  const dateRange = { startDate, endDate };

  let timeRangeLabel = "Last 24 hours";
  switch (timeRange) {
    case "24h":
      timeRangeLabel = "Last 24 hours";
      break;
    case "7d":
      timeRangeLabel = "Last 7 days";
      break;
    case "30d":
      timeRangeLabel = "Last 30 days";
      break;
  }

  let activeFiltersCount = 0;
  if (connectionIds.length > 0) activeFiltersCount++;
  if (toolFilter) activeFiltersCount++;
  if (statusFilter !== "all") activeFiltersCount++;

  return (
    <CollectionPage>
      <CollectionHeader
        title="Monitoring"
        ctaButton={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {timeRangeLabel}
            </span>
            <Select
              value={timeRange}
              onValueChange={(value: string) =>
                updateFilters({ timeRange: value as TimeRange })
              }
            >
              <SelectTrigger className="h-7 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Stats Banner */}
        <ErrorBoundary
          fallback={
            <div className="border-b bg-muted/30 px-5 py-3 flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                Failed to load stats
              </div>
            </div>
          }
        >
          <Suspense fallback={<MonitoringStats.Skeleton />}>
            <MonitoringStats dateRange={dateRange} isStreaming={isStreaming} />
          </Suspense>
        </ErrorBoundary>

        {/* Search and Actions Bar */}
        <MonitoringFilters
          searchQuery={searchQuery}
          connectionIds={connectionIds}
          toolFilter={toolFilter}
          statusFilter={statusFilter}
          isStreaming={isStreaming}
          connectionOptions={connectionOptions}
          activeFiltersCount={activeFiltersCount}
          onUpdateFilters={updateFilters}
          onToggleStreaming={() => setIsStreaming(!isStreaming)}
        />

        {/* Logs Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ErrorBoundary fallback={<MonitoringLogsTable.Error />}>
            <Suspense fallback={<MonitoringLogsTable.Skeleton />}>
              <MonitoringLogsTable
                dateRange={dateRange}
                connectionIds={connectionIds}
                toolFilter={toolFilter}
                statusFilter={statusFilter}
                searchQuery={searchQuery}
                page={page}
                pageSize={pageSize}
                isStreaming={isStreaming}
                onUpdateFilters={updateFilters}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </CollectionPage>
  );
}

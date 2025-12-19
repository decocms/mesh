/**
 * Monitoring Dashboard Route
 *
 * Displays tool call monitoring logs and statistics for the organization.
 */

import { Button } from "@deco/ui/components/button.tsx";
import {
  TimeRangePicker,
  type TimeRange as TimeRangeValue,
} from "@deco/ui/components/time-range-picker.tsx";
import { expressionToDate } from "@deco/ui/lib/time-expressions.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { MultiSelect } from "@deco/ui/components/multi-select.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Fragment, Suspense, useState, useRef } from "react";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// @ts-ignore - correct
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism/index.js";
import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  MonitoringStatsRow,
  MonitoringStatsRowSkeleton,
  calculateStats,
  type MonitoringLog as SharedMonitoringLog,
  type MonitoringLogsResponse as SharedMonitoringLogsResponse,
  type DateRange,
} from "@/web/components/monitoring/monitoring-stats-row.tsx";

// ============================================================================
// Types
// ============================================================================

interface MonitoringLog extends SharedMonitoringLog {
  organizationId: string;
  userId: string | null;
  requestId: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
}

interface MonitoringLogsResponse
  extends Omit<SharedMonitoringLogsResponse, "logs"> {
  logs: MonitoringLog[];
}

interface MonitoringSearchParams {
  // Time range using expressions (from/to)
  from?: string; // e.g., "now-24h", "now-7d", or ISO string
  to?: string; // e.g., "now" or ISO string
  connections?: string; // Comma-separated connection IDs
  tool?: string;
  status?: "all" | "success" | "errors";
  search?: string;
  page?: number;
}

// ============================================================================
// Stats Component
// ============================================================================

interface MonitoringStatsProps {
  dateRange: DateRange;
  displayDateRange: DateRange;
  isStreaming: boolean;
  connectionIds: string[];
  toolFilter: string;
  statusFilter: string;
}

function MonitoringStatsContent({
  dateRange,
  displayDateRange,
  isStreaming,
  connectionIds,
  toolFilter,
  statusFilter,
}: MonitoringStatsProps) {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();

  const logsParams = {
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    // Only pass single connection to API; multi-connection is filtered client-side
    connectionId: connectionIds.length === 1 ? connectionIds[0] : undefined,
    toolName: toolFilter || undefined,
    isError:
      statusFilter === "errors"
        ? true
        : statusFilter === "success"
          ? false
          : undefined,
    limit: 750,
    offset: 0,
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
    refetchInterval: isStreaming ? 3000 : false,
  });

  // Filter logs by multiple connection IDs (client-side if more than one selected)
  let logs = logsData?.logs ?? [];
  if (connectionIds.length > 1) {
    logs = logs.filter((log) => connectionIds.includes(log.connectionId));
  }

  // Use server total only when not doing client-side filtering
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
  toolFilter: string;
  statusFilter: string;
  connectionOptions: Array<{ value: string; label: string }>;
  activeFiltersCount: number;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
}

function FiltersPopover({
  connectionIds,
  toolFilter,
  statusFilter,
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
  );
}

// ============================================================================
// Expanded Row Content Component
// ============================================================================

interface ExpandedLogContentProps {
  log: MonitoringLog;
}

function ExpandedLogContent({ log }: ExpandedLogContentProps) {
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const handleCopy = async (text: string, type: "input" | "output") => {
    await navigator.clipboard.writeText(text);
    if (type === "input") {
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 2000);
    } else {
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  return (
    <div className="space-y-3 text-sm px-3 md:px-5 py-4 bg-muted/30">
      {log.errorMessage && (
        <div>
          <div className="font-medium text-destructive mb-1">Error Message</div>
          <div className="text-destructive font-mono text-xs bg-destructive/10 p-2 rounded break-all">
            {log.errorMessage}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="rounded-lg bg-muted overflow-hidden border border-border">
            <div className="flex items-center justify-between p-1 pl-4 bg-transparent border-b border-border">
              <span className="text-xs font-mono uppercase text-muted-foreground tracking-widest select-none">
                Input
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  handleCopy(JSON.stringify(log.input, null, 2), "input")
                }
                aria-label="Copy input"
                className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
              >
                <Icon name={copiedInput ? "check" : "content_copy"} size={14} />
              </Button>
            </div>
            <div className="h-[200px] md:h-[300px] overflow-auto">
              <SyntaxHighlighter
                language="json"
                style={oneLight}
                customStyle={{
                  margin: 0,
                  padding: "1rem",
                  fontSize: "0.75rem",
                  height: "100%",
                }}
                codeTagProps={{
                  className: "font-mono",
                  style: {
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    whiteSpace: "pre-wrap",
                  },
                }}
                wrapLongLines
              >
                {JSON.stringify(log.input, null, 2)}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
        <div>
          <div className="rounded-lg bg-muted overflow-hidden border border-border">
            <div className="flex items-center justify-between p-1 pl-4 bg-transparent border-b border-border">
              <span className="text-xs font-mono uppercase text-muted-foreground tracking-widest select-none">
                Output
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  handleCopy(JSON.stringify(log.output, null, 2), "output")
                }
                aria-label="Copy output"
                className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
              >
                <Icon
                  name={copiedOutput ? "check" : "content_copy"}
                  size={14}
                />
              </Button>
            </div>
            <div className="h-[200px] md:h-[300px] overflow-auto">
              <SyntaxHighlighter
                language="json"
                style={oneLight}
                customStyle={{
                  margin: 0,
                  padding: "1rem",
                  fontSize: "0.75rem",
                  height: "100%",
                }}
                codeTagProps={{
                  className: "font-mono",
                  style: {
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    whiteSpace: "pre-wrap",
                  },
                }}
                wrapLongLines
              >
                {JSON.stringify(log.output, null, 2)}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  pageSize: number;
  isStreaming: boolean;
}

function MonitoringLogsTableContent({
  dateRange,
  connectionIds,
  toolFilter,
  statusFilter,
  searchQuery,
  pageSize,
  isStreaming,
}: MonitoringLogsTableProps) {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const connections = useConnections() ?? [];
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [allLogs, setAllLogs] = useState<MonitoringLog[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Create a stable key for detecting filter changes
  const filterKey = `${connectionIds.join(",")}-${toolFilter}-${statusFilter}-${searchQuery}-${dateRange.startDate.toISOString()}-${dateRange.endDate.toISOString()}`;

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
    offset: currentPage * pageSize,
  };

  const { data: logs } = useToolCall<typeof logsParams, MonitoringLogsResponse>(
    {
      toolCaller,
      toolName: "MONITORING_LOGS_LIST",
      toolInputParams: logsParams,
      scope: locator,
      staleTime: 0,
      refetchInterval: isStreaming ? 3000 : false,
    },
  );

  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset when filters change (action during render pattern)
  const prevFilterKeyRef = useRef(filterKey);
  // Initialize with null to ensure first comparison triggers update (fixes Suspense issue)
  const prevLogsRef = useRef<MonitoringLogsResponse | null>(null);

  if (prevFilterKeyRef.current !== filterKey) {
    prevFilterKeyRef.current = filterKey;
    prevLogsRef.current = null; // Reset so new data triggers update
    setCurrentPage(0);
    setAllLogs([]);
    setHasMore(true);
    setIsLoadingMore(false);
  }

  // Update allLogs when new data comes in (action during render pattern)
  if (logs && logs !== prevLogsRef.current) {
    prevLogsRef.current = logs;
    if (logs.logs) {
      setAllLogs((prev) => {
        // If it's page 0, replace; otherwise append
        if (currentPage === 0) {
          return logs.logs;
        }
        // Check if we already have these logs to avoid duplicates
        const existingIds = new Set(prev.map((log) => log.id));
        const newLogs = logs.logs.filter((log) => !existingIds.has(log.id));
        return [...prev, ...newLogs];
      });
      setHasMore(logs.logs.length >= pageSize);
      setIsLoadingMore(false);
    }
  }

  // Setup intersection observer for infinite scroll
  const lastLogRef = (node: HTMLDivElement | null) => {
    if (isLoadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
        setIsLoadingMore(true);
        setCurrentPage((prev) => prev + 1);
      }
    });

    if (node) observerRef.current.observe(node);
  };

  // Filter logs by search query and multiple connections (client-side)
  let filteredLogs = allLogs;

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

  const renderLogRow = (log: MonitoringLog, index: number) => {
    const isLastLog = index === filteredLogs.length - 1;
    const isFirstLog = index === 0;
    const connection = connectionMap.get(log.connectionId);
    const timestamp = new Date(log.timestamp);
    const dateStr = timestamp.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const timeStr = timestamp.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const isExpanded = expandedRows.has(log.id);

    return (
      <Fragment key={log.id}>
        <div
          ref={isLastLog ? lastLogRef : null}
          className={`flex items-center h-14 md:h-16 ${isFirstLog ? "" : "border-t border-border/60"} transition-colors cursor-pointer ${
            isExpanded ? "bg-muted/30 hover:bg-accent/80" : "hover:bg-muted/40"
          }`}
          onClick={() => toggleRow(log)}
        >
          {/* Expand Icon */}
          <div className="flex items-center justify-center w-10 md:w-12 px-2 md:px-4">
            <Icon
              name={isExpanded ? "expand_more" : "chevron_right"}
              size={16}
              className="text-muted-foreground"
            />
          </div>

          {/* Connection Icon */}
          <div className="flex items-center justify-center w-12 md:w-16 px-2 md:px-4">
            <IntegrationIcon
              icon={connection?.icon || null}
              name={log.connectionTitle}
              size="xs"
              className="shadow-sm"
            />
          </div>

          {/* Tool Name + Connection Name */}
          <div className="flex-1 min-w-0 pr-2 md:pr-4">
            <div className="text-xs font-medium text-foreground truncate block">
              {log.toolName}
            </div>
            <div className="text-xs text-muted-foreground truncate block">
              {log.connectionTitle}
            </div>
          </div>

          {/* Date */}
          <div className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
            {dateStr}
          </div>

          {/* Time */}
          <div className="w-20 md:w-28 px-2 md:px-3 text-xs text-muted-foreground">
            {timeStr}
          </div>

          {/* Duration */}
          <div className="w-16 md:w-20 px-2 md:px-3 text-xs text-muted-foreground font-mono text-right">
            {log.durationMs}ms
          </div>

          {/* Status Badge */}
          <div className="w-16 md:w-24 flex items-center justify-end pr-3 md:pr-5">
            <Badge
              variant={log.isError ? "destructive" : "success"}
              className="text-xs px-1.5 md:px-2 py-0.5 md:py-1"
            >
              {log.isError ? "Error" : "OK"}
            </Badge>
          </div>
        </div>
        {isExpanded && (
          <div>
            <ExpandedLogContent log={log} />
          </div>
        )}
      </Fragment>
    );
  };

  if (filteredLogs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="No logs found"
          description={
            searchQuery ||
            connectionIds.length > 0 ||
            toolFilter ||
            statusFilter !== "all"
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
          <div className="flex items-center h-9 border-b border-border sticky top-0 z-20 relative before:absolute before:inset-0 before:bg-background before:z-[-1] after:absolute after:inset-0 after:bg-muted/30 after:z-[-1]">
            {/* Expand Icon Column */}
            <div className="w-10 md:w-12 px-2 md:px-4" />

            {/* Connection Icon Column */}
            <div className="w-12 md:w-16 px-2 md:px-4" />

            {/* Tool/Connection Column */}
            <div className="flex-1 pr-2 md:pr-4 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Tool / MCP Server
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
          {filteredLogs.map((log, index) => renderLogRow(log, index))}

          {/* Loading indicator */}
          {isLoadingMore && hasMore && (
            <div className="flex items-center justify-center h-16 border-t border-border/60">
              <span className="text-sm text-muted-foreground">
                Loading more...
              </span>
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
      <div className="text-muted-foreground">Loading logs...</div>
    </div>
  );
}

function MonitoringLogsTableError() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <EmptyState
        title="Failed to load logs"
        description="There was an error loading the monitoring logs. Please try again."
      />
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
  const fromExpression = search.from || "now-24h";
  const toExpression = search.to || "now";
  const connectionIds = search.connections ? search.connections.split(",") : [];
  const toolFilter = search.tool || "";
  const searchQuery = search.search || "";
  const statusFilter = search.status || "all";

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
      search: { ...search, ...updates },
    });
  };

  // Handle time range change
  const handleTimeRangeChange = (range: TimeRangeValue) => {
    updateFilters({ from: range.from, to: range.to });
  };

  // Calculate date range from expressions
  const fromResult = expressionToDate(fromExpression);
  const toResult = expressionToDate(toExpression);

  const startDate =
    fromResult.date || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const originalEndDate = toResult.date || new Date();

  // Original range for bucket calculations (what user selected)
  const displayDateRange = { startDate, endDate: originalEndDate };

  // Extended range for fetching logs when streaming
  let fetchEndDate = originalEndDate;
  if (isStreaming && toExpression === "now") {
    fetchEndDate = new Date(originalEndDate);
    fetchEndDate.setHours(fetchEndDate.getHours() + 1);
  }
  const dateRange = { startDate, endDate: fetchEndDate };

  let activeFiltersCount = 0;
  if (connectionIds.length > 0) activeFiltersCount++;
  if (toolFilter) activeFiltersCount++;
  if (statusFilter !== "all") activeFiltersCount++;

  return (
    <CollectionPage>
      <CollectionHeader
        title="Monitoring"
        ctaButton={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filters Button */}
            <FiltersPopover
              connectionIds={connectionIds}
              toolFilter={toolFilter}
              statusFilter={statusFilter}
              connectionOptions={connectionOptions}
              activeFiltersCount={activeFiltersCount}
              onUpdateFilters={updateFilters}
            />

            {/* Streaming Toggle */}
            <Button
              variant={isStreaming ? "secondary" : "outline"}
              size="sm"
              className={`h-7 px-2 sm:px-3 gap-1.5 ${isStreaming ? "bg-muted hover:bg-muted/80" : ""}`}
              onClick={() => setIsStreaming(!isStreaming)}
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
              value={{ from: fromExpression, to: toExpression }}
              onChange={handleTimeRangeChange}
            />
          </div>
        }
      />

      <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden">
        {/* Stats Banner */}
        <ErrorBoundary
          fallback={
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[0.5px] bg-border flex-shrink-0 border-b">
              <div className="bg-background p-5 text-sm text-muted-foreground">
                Failed to load stats
              </div>
            </div>
          }
        >
          <Suspense fallback={<MonitoringStats.Skeleton />}>
            <MonitoringStats
              dateRange={dateRange}
              displayDateRange={displayDateRange}
              isStreaming={isStreaming}
              connectionIds={connectionIds}
              toolFilter={toolFilter}
              statusFilter={statusFilter}
            />
          </Suspense>
        </ErrorBoundary>

        {/* Search Bar */}
        <CollectionSearch
          value={searchQuery}
          onChange={(value) => updateFilters({ search: value })}
          placeholder="Search by tool name, connection, or error..."
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              updateFilters({ search: "" });
              (event.target as HTMLInputElement).blur();
            }
          }}
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
                pageSize={50}
                isStreaming={isStreaming}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </CollectionPage>
  );
}

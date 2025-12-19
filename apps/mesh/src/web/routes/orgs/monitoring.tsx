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
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  MonitoringStatsRow,
  MonitoringStatsRowSkeleton,
  calculateStats,
  type DateRange,
  type MonitoringLog as SharedMonitoringLog,
  type MonitoringLogsResponse as SharedMonitoringLogsResponse,
} from "@/web/components/monitoring/monitoring-stats-row.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
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
import { Fragment, Suspense, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

// @ts-ignore - correct
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism/index.js";

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

interface EnrichedMonitoringLog extends MonitoringLog {
  userName: string;
  userImage: string | undefined;
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
  streaming?: boolean;
}

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
// JSON Syntax Highlighter Component
// ============================================================================

const SYNTAX_HIGHLIGHTER_CUSTOM_STYLE = {
  margin: 0,
  padding: "1rem",
  fontSize: "0.75rem",
  height: "100%",
} as const;

const SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS = {
  className: "font-mono",
  style: {
    wordBreak: "break-word",
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
} as const;

interface JsonSyntaxHighlighterProps {
  jsonString: string;
}

function JsonSyntaxHighlighter({ jsonString }: JsonSyntaxHighlighterProps) {
  return (
    <SyntaxHighlighter
      language="json"
      style={oneLight}
      customStyle={SYNTAX_HIGHLIGHTER_CUSTOM_STYLE}
      codeTagProps={SYNTAX_HIGHLIGHTER_CODE_TAG_PROPS}
      wrapLongLines
    >
      {jsonString}
    </SyntaxHighlighter>
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

  const inputJsonString = JSON.stringify(log.input, null, 2);
  const outputJsonString = JSON.stringify(log.output, null, 2);

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
                onClick={() => handleCopy(inputJsonString, "input")}
                aria-label="Copy input"
                className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"
              >
                <Icon name={copiedInput ? "check" : "content_copy"} size={14} />
              </Button>
            </div>
            <div className="h-[200px] md:h-[300px] overflow-auto">
              <JsonSyntaxHighlighter jsonString={inputJsonString} />
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
                onClick={() => handleCopy(outputJsonString, "output")}
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
              <JsonSyntaxHighlighter jsonString={outputJsonString} />
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
  connectionIds: string[];
  tool: string;
  status: string;
  search: string;
  pageSize: number;
  page: number;
  logsData: MonitoringLogsResponse;
  onPageChange: (page: number) => void;
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
}: MonitoringLogsTableProps) {
  const connections = useConnections() ?? [];
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Get logs from the current page
  const logs = logsData?.logs ?? [];

  // Check if there are more pages available
  const hasMore = logs.length >= pageSize;

  // Setup intersection observer for infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastLogRef = (node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore) {
        onPageChange(page + 1);
      }
    });

    if (node) observerRef.current.observe(node);
  };

  const { data: membersData } = useMembers();
const members = membersData?.data?.members ?? [];
const userMap = new Map(members.map(m => [m.userId, m.user]));

const enrichedLogs: EnrichedMonitoringLog[] = logs.map((log) => {
  const user = userMap.get(log.userId ?? "");
  return {
    ...log,
    userName: user?.name ?? log.userId ?? "Unknown",
    userImage: user?.image,
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

  const renderLogRow = (log: EnrichedMonitoringLog, index: number) => {
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

           {/* User Name */}
           <div className="w-20 md:w-24 px-2 md:px-3 text-xs text-muted-foreground">
            {log.userName}
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
  // Get all connections for the multi-select - moved here because useConnections suspends
  const allConnections = useConnections() ?? [];
  const connectionOptions = allConnections.map((conn) => ({
    value: conn.id,
    label: conn.title || conn.id,
  }));

  const pageSize = 50;
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
    refetchInterval: isStreaming ? 3000 : false,
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

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
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useInfiniteScroll } from "@/web/hooks/use-infinite-scroll.ts";
import { useMembers } from "@/web/hooks/use-members";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { FilterLines, PauseCircle, PlayCircle } from "@untitledui/icons";
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
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, useRef, useState } from "react";
import {
  type EnrichedMonitoringLog,
  type MonitoringLogsResponse,
  type MonitoringSearchParams,
  type PropertyFilter,
  type PropertyFilterOperator,
  deserializePropertyFilters,
  serializePropertyFilters,
  propertyFiltersToApiParams,
  propertyFiltersToRaw,
  parseRawPropertyFilters,
} from "@/web/components/monitoring";
import { Plus, Trash01, Code01, Grid01 } from "@untitledui/icons";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";

// ============================================================================
// Stats Component
// ============================================================================

interface MonitoringStatsProps {
  displayDateRange: DateRange;
  connectionIds: string[];
  logs: MonitoringLogsResponse["logs"];
  total?: number;
}

function MonitoringStatsContent({
  displayDateRange,
  connectionIds,
  logs: allLogs,
  total,
}: MonitoringStatsProps) {
  // Filter logs by multiple connection IDs (client-side if more than one selected)
  let logs = allLogs;
  if (connectionIds.length > 1) {
    logs = logs.filter((log) => connectionIds.includes(log.connectionId));
  }

  // Use server total for stats calculation (logs are paginated, so we need the total)
  const totalCalls = connectionIds.length > 1 ? undefined : total;
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
  gatewayIds: string[];
  tool: string;
  status: string;
  propertyFilters: PropertyFilter[];
  connectionOptions: Array<{ value: string; label: string }>;
  gatewayOptions: Array<{ value: string; label: string }>;
  activeFiltersCount: number;
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
}

const OPERATOR_OPTIONS: Array<{
  value: PropertyFilterOperator;
  label: string;
}> = [
  { value: "eq", label: "equals" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "exists" },
];

function FiltersPopover({
  connectionIds,
  gatewayIds,
  tool,
  status,
  propertyFilters,
  connectionOptions,
  gatewayOptions,
  activeFiltersCount,
  onUpdateFilters,
}: FiltersPopoverProps) {
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [propertyFilterMode, setPropertyFilterMode] = useState<"raw" | "form">(
    "raw",
  );

  // Local state for text inputs to prevent focus loss during typing
  const [localTool, setLocalTool] = useState(tool);
  const [localPropertyFilters, setLocalPropertyFilters] =
    useState<PropertyFilter[]>(propertyFilters);
  const [localRawFilters, setLocalRawFilters] = useState(
    propertyFiltersToRaw(propertyFilters),
  );

  // Track previous prop values to detect external changes
  const prevToolRef = useRef(tool);
  const prevPropertyFiltersRef = useRef(
    serializePropertyFilters(propertyFilters),
  );

  // Sync local state when props change externally (not from our own updates)
  if (prevToolRef.current !== tool) {
    prevToolRef.current = tool;
    if (localTool !== tool) {
      setLocalTool(tool);
    }
  }

  const currentSerialized = serializePropertyFilters(propertyFilters);
  if (prevPropertyFiltersRef.current !== currentSerialized) {
    prevPropertyFiltersRef.current = currentSerialized;
    setLocalPropertyFilters(propertyFilters);
    setLocalRawFilters(propertyFiltersToRaw(propertyFilters));
  }

  const updatePropertyFilter = (
    index: number,
    updates: Partial<PropertyFilter>,
  ) => {
    const newFilters = [...localPropertyFilters];
    newFilters[index] = { ...newFilters[index], ...updates };
    setLocalPropertyFilters(newFilters);
  };

  const addPropertyFilter = () => {
    setLocalPropertyFilters([
      ...localPropertyFilters,
      { key: "", operator: "eq", value: "" },
    ]);
  };

  const removePropertyFilter = (index: number) => {
    const newFilters = localPropertyFilters.filter((_, i) => i !== index);
    setLocalPropertyFilters(newFilters);
    setLocalRawFilters(propertyFiltersToRaw(newFilters));
    // Immediately sync when removing
    onUpdateFilters({ propertyFilters: serializePropertyFilters(newFilters) });
  };

  const applyPropertyFilters = () => {
    onUpdateFilters({
      propertyFilters: serializePropertyFilters(localPropertyFilters),
    });
  };

  const applyRawFilters = () => {
    const parsed = parseRawPropertyFilters(localRawFilters);
    setLocalPropertyFilters(parsed);
    onUpdateFilters({
      propertyFilters: serializePropertyFilters(parsed),
    });
  };

  const toggleMode = () => {
    if (propertyFilterMode === "raw") {
      // Switching to form mode - parse raw
      const parsed = parseRawPropertyFilters(localRawFilters);
      setLocalPropertyFilters(parsed);
      setPropertyFilterMode("form");
    } else {
      // Switching to raw mode - serialize form
      setLocalRawFilters(propertyFiltersToRaw(localPropertyFilters));
      setPropertyFilterMode("raw");
    }
  };

  return (
    <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-3 gap-1.5">
          <FilterLines size={16} />
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
                MCP Servers
              </label>
              <MultiSelect
                options={connectionOptions}
                defaultValue={connectionIds}
                onValueChange={(values) =>
                  onUpdateFilters({ connectionId: values })
                }
                placeholder="All servers"
                variant="secondary"
                className="w-full"
                maxCount={2}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Gateways
              </label>
              <MultiSelect
                options={gatewayOptions}
                defaultValue={gatewayIds}
                onValueChange={(values) =>
                  onUpdateFilters({ gatewayId: values })
                }
                placeholder="All gateways"
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
                id="filter-tool"
                placeholder="Filter by tool..."
                value={localTool}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLocalTool(e.target.value)
                }
                onBlur={() => {
                  if (localTool !== tool) {
                    onUpdateFilters({ tool: localTool });
                  }
                }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" && localTool !== tool) {
                    onUpdateFilters({ tool: localTool });
                  }
                }}
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Property Filters
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleMode}
                    >
                      {propertyFilterMode === "raw" ? (
                        <Grid01 size={14} />
                      ) : (
                        <Code01 size={14} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {propertyFilterMode === "raw"
                      ? "Switch to form view"
                      : "Switch to raw text"}
                  </TooltipContent>
                </Tooltip>
              </div>

              {propertyFilterMode === "raw" ? (
                <div className="space-y-1.5">
                  <Textarea
                    placeholder={`Paste property filters here:\nthread_id=abc123\nuser~test\ndebug?`}
                    value={localRawFilters}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setLocalRawFilters(e.target.value)
                    }
                    onBlur={applyRawFilters}
                    onKeyDown={(
                      e: React.KeyboardEvent<HTMLTextAreaElement>,
                    ) => {
                      if (e.key === "Enter" && e.metaKey) {
                        applyRawFilters();
                      }
                    }}
                    className="font-mono text-sm min-h-[80px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    One per line:{" "}
                    <code className="bg-muted px-1 rounded">key=value</code>{" "}
                    <code className="bg-muted px-1 rounded">key~contains</code>{" "}
                    <code className="bg-muted px-1 rounded">key?</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localPropertyFilters.map((filter, index) => (
                    <div
                      key={index}
                      className="p-2.5 rounded-md border border-border bg-muted/30 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Filter {index + 1}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removePropertyFilter(index)}
                        >
                          <Trash01 size={12} />
                        </Button>
                      </div>
                      <Input
                        placeholder="Property key (e.g., thread_id)"
                        value={filter.key}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updatePropertyFilter(index, { key: e.target.value })
                        }
                        onBlur={applyPropertyFilters}
                        onKeyDown={(
                          e: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                          if (e.key === "Enter") applyPropertyFilters();
                        }}
                        className="font-mono text-sm"
                      />
                      <div className="flex gap-2">
                        <Select
                          value={filter.operator}
                          onValueChange={(value: PropertyFilterOperator) => {
                            updatePropertyFilter(index, { operator: value });
                            if (value === "exists") {
                              updatePropertyFilter(index, {
                                operator: value,
                                value: "",
                              });
                            }
                            setTimeout(applyPropertyFilters, 0);
                          }}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATOR_OPTIONS.map((op) => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {filter.operator !== "exists" && (
                          <Input
                            placeholder="Value"
                            value={filter.value}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              updatePropertyFilter(index, {
                                value: e.target.value,
                              })
                            }
                            onBlur={applyPropertyFilters}
                            onKeyDown={(
                              e: React.KeyboardEvent<HTMLInputElement>,
                            ) => {
                              if (e.key === "Enter") applyPropertyFilters();
                            }}
                            className="flex-1 font-mono text-sm"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={addPropertyFilter}
                  >
                    <Plus size={14} className="mr-1.5" />
                    Add filter
                  </Button>
                </div>
              )}
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setLocalTool("");
                setLocalPropertyFilters([]);
                setLocalRawFilters("");
                onUpdateFilters({
                  connectionId: [],
                  gatewayId: [],
                  tool: "",
                  status: "all",
                  propertyFilters: "",
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
  gatewayIds: string[];
  tool: string;
  status: string;
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
  connectionIds,
  gatewayIds,
  tool,
  status,
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

  // Use the infinite scroll hook with loading guard
  const lastLogRef = useInfiniteScroll(onLoadMore, hasMore, isLoadingMore);

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

  // Filter logs by search query and multiple connections/gateways (client-side)
  let filteredLogs = enrichedLogs;

  // Filter by multiple connection IDs (if more than one selected)
  if (connectionIds.length > 1) {
    filteredLogs = filteredLogs.filter((log) =>
      connectionIds.includes(log.connectionId),
    );
  }

  // Filter by multiple gateway IDs (if more than one selected)
  if (gatewayIds.length > 1) {
    filteredLogs = filteredLogs.filter(
      (log) => log.gatewayId && gatewayIds.includes(log.gatewayId),
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

  // Get connection info
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
            searchQuery ||
            connectionIds.length > 0 ||
            gatewayIds.length > 0 ||
            tool ||
            status !== "all"
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

            {/* Gateway Column */}
            <div className="w-24 md:w-32 px-2 md:px-3 text-xs font-mono font-normal text-muted-foreground uppercase tracking-wide">
              Gateway
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
          {filteredLogs.map((log, index) => (
            <LogRow
              key={log.id}
              log={log}
              isFirst={index === 0}
              isExpanded={expandedRows.has(log.id)}
              connection={connectionMap.get(log.connectionId)}
              gatewayName={log.gatewayName ?? ""}
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
  gatewayIds: string[];
  tool: string;
  status: string;
  search: string;
  streaming: boolean;
  activeFiltersCount: number;
  from: string;
  to: string;
  propertyFilters: PropertyFilter[];
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
  onTimeRangeChange: (range: TimeRangeValue) => void;
  onStreamingToggle: () => void;
}

function MonitoringDashboardContent({
  dateRange,
  displayDateRange,
  connectionIds,
  gatewayIds,
  tool,
  status,
  search: searchQuery,
  streaming: isStreaming,
  activeFiltersCount,
  from,
  to,
  propertyFilters,
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
  const gatewayOptions = allGateways.map((gw) => ({
    value: gw.id,
    label: gw.title || gw.id,
  }));

  const { pageSize, streamingRefetchInterval } = MONITORING_CONFIG;
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();

  // Convert property filters to API params
  const propertyApiParams = propertyFiltersToApiParams(propertyFilters);

  // Base params for filtering (without pagination)
  const baseParams = {
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    connectionId: connectionIds.length === 1 ? connectionIds[0] : undefined,
    gatewayId: gatewayIds.length === 1 ? gatewayIds[0] : undefined,
    toolName: tool || undefined,
    isError:
      status === "errors" ? true : status === "success" ? false : undefined,
    ...propertyApiParams,
  };

  // Use React Query's infinite query for automatic accumulation
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery({
      queryKey: KEYS.monitoringLogsInfinite(
        locator,
        JSON.stringify(baseParams),
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
        // If we got fewer logs than pageSize, there are no more pages
        if ((lastPage?.logs?.length ?? 0) < pageSize) {
          return undefined;
        }
        // Otherwise, return the next offset
        return allPages.length * pageSize;
      },
      staleTime: 0,
      refetchInterval: isStreaming ? streamingRefetchInterval : false,
    });

  // Flatten all pages into a single array
  const allLogs = data?.pages.flatMap((page) => page?.logs ?? []) ?? [];
  const total = data?.pages[0]?.total;

  // Handler for loading more
  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
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
              gatewayIds={gatewayIds}
              tool={tool}
              status={status}
              propertyFilters={propertyFilters}
              connectionOptions={connectionOptions}
              gatewayOptions={gatewayOptions}
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
              {isStreaming ? (
                <PauseCircle size={16} className="animate-pulse" />
              ) : (
                <PlayCircle size={16} />
              )}
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
          logs={allLogs}
          total={total}
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
            gatewayIds={gatewayIds}
            tool={tool}
            status={status}
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

export default function MonitoringDashboard() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const search = useSearch({
    from: "/shell/$org/monitoring",
  });

  const {
    from,
    to,
    connectionId: connectionIds = [],
    gatewayId: gatewayIds = [],
    tool,
    search: searchQuery,
    status,
    streaming = true,
    propertyFilters: propertyFiltersStr = "",
  } = search;

  // Parse property filters from URL string
  const propertyFilters = deserializePropertyFilters(propertyFiltersStr);

  // Update URL with new filter values (pagination is handled internally, not in URL)
  const updateFilters = (updates: Partial<MonitoringSearchParams>) => {
    navigate({
      to: "/$org/monitoring",
      params: { org: org.slug },
      search: {
        ...search,
        ...updates,
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
  if (gatewayIds.length > 0) activeFiltersCount++;
  if (tool) activeFiltersCount++;
  if (status !== "all") activeFiltersCount++;
  // Count property filters with non-empty keys
  const validPropertyFilters = propertyFilters.filter((f) => f.key.trim());
  if (validPropertyFilters.length > 0)
    activeFiltersCount += validPropertyFilters.length;

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
            gatewayIds={gatewayIds}
            tool={tool}
            status={status}
            search={searchQuery}
            streaming={streaming}
            activeFiltersCount={activeFiltersCount}
            from={from}
            to={to}
            propertyFilters={propertyFilters}
            onUpdateFilters={updateFilters}
            onTimeRangeChange={handleTimeRangeChange}
            onStreamingToggle={() => updateFilters({ streaming: !streaming })}
          />
        </Suspense>
      </ErrorBoundary>
    </CollectionPage>
  );
}

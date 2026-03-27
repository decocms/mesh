/**
 * Monitoring Dashboard Route
 *
 * Displays tool call monitoring logs and statistics for the organization.
 */

import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { MONITORING_CONFIG } from "@/web/components/monitoring/config.ts";
import type { DateRange } from "@/web/components/monitoring/monitoring-stats-row.tsx";
import { useMembers } from "@/web/hooks/use-members";
import {
  SELF_MCP_ALIAS_ID,
  WellKnownOrgMCPId,
  useConnections,
  useMCPClient,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { PauseCircle, PlayCircle } from "@untitledui/icons";
import {
  TimeRangePicker,
  type TimeRange as TimeRangeValue,
} from "@deco/ui/components/time-range-picker.tsx";
import { expressionToDate } from "@deco/ui/lib/time-expressions.ts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import {
  type MonitoringSearchParams,
  type PropertyFilter,
  deserializePropertyFilters,
  propertyFiltersToApiParams,
} from "@/web/components/monitoring";
import { CollectionTabs } from "@/web/components/collections/collection-tabs.tsx";
import {
  MonitoringStats,
  LlmStats,
  ActivityBreakdown,
} from "@/web/components/monitoring/monitoring-overview.tsx";
import { FiltersPopover } from "@/web/components/monitoring/monitoring-filters.tsx";
import {
  MonitoringLogsTable,
  AuditTabContent,
} from "@/web/components/monitoring/monitoring-logs-table.tsx";

// ============================================================================
// Main Dashboard Component
// ============================================================================

interface MonitoringDashboardContentProps {
  tab: "overview" | "audit";
  dateRange: DateRange;
  displayDateRange: DateRange;
  connectionIds: string[];
  virtualMcpIds: string[];
  tool: string;
  status: string;
  search: string;
  streaming: boolean;
  hideSystem: boolean;
  activeFiltersCount: number;
  from: string;
  to: string;
  propertyFilters: PropertyFilter[];
  onUpdateFilters: (updates: Partial<MonitoringSearchParams>) => void;
  onTimeRangeChange: (range: TimeRangeValue) => void;
  onStreamingToggle: () => void;
  onTabChange: (tab: "overview" | "audit") => void;
}

function MonitoringDashboardContent({
  tab,
  dateRange,
  displayDateRange,
  connectionIds,
  virtualMcpIds,
  tool,
  status,
  search: searchQuery,
  streaming: isStreaming,
  hideSystem,
  activeFiltersCount,
  from,
  to,
  propertyFilters,
  onUpdateFilters,
  onTimeRangeChange,
  onStreamingToggle,
  onTabChange,
}: MonitoringDashboardContentProps) {
  // Get all connections, virtual MCPs, and members - moved here because these hooks suspend
  const allConnections = useConnections();
  const allVirtualMcps = useVirtualMCPs();
  const { data: membersData } = useMembers();

  // Separate search-filtered connections for the dropdown
  const [connectionSearch, setConnectionSearch] = useState("");
  const searchFilteredConnections = useConnections({
    searchTerm: connectionSearch || undefined,
  });
  const connectionOptions = (searchFilteredConnections ?? []).map((conn) => ({
    value: conn.id,
    label: conn.title || conn.id,
  }));
  const virtualMcpOptions = allVirtualMcps.map((vm) => ({
    value: vm.id ?? "",
    label: vm.title ?? "Decopilot",
  }));

  const { pageSize, streamingRefetchInterval } = MONITORING_CONFIG;
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Convert property filters to API params
  const propertyApiParams = propertyFiltersToApiParams(propertyFilters);

  // Compute excluded connection IDs when hiding system calls
  const excludeConnectionIds = hideSystem
    ? [WellKnownOrgMCPId.SELF(org.id)]
    : undefined;

  const [aiOnly, setAiOnly] = useState(false);

  // Base params for filtering (without pagination)
  const baseParams = {
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    connectionId: aiOnly ? "decopilot" : undefined,
    connectionIds:
      !aiOnly && connectionIds.length > 0 ? connectionIds : undefined,
    excludeConnectionIds,
    virtualMcpIds: virtualMcpIds.length > 0 ? virtualMcpIds : undefined,
    toolName: tool || undefined,
    isError:
      status === "errors" ? true : status === "success" ? false : undefined,
    ...propertyApiParams,
  };

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "audit" as const, label: "Audit" },
  ];

  return (
    <>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Monitoring</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        {(tab === "overview" || tab === "audit") && (
          <Page.Header.Right>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filters Button */}
              <FiltersPopover
                connectionIds={connectionIds}
                virtualMcpIds={virtualMcpIds}
                tool={tool}
                status={status}
                hideSystem={hideSystem}
                aiOnly={aiOnly}
                onAiOnlyChange={setAiOnly}
                propertyFilters={propertyFilters}
                connectionOptions={connectionOptions}
                virtualMcpOptions={virtualMcpOptions}
                activeFiltersCount={activeFiltersCount + (aiOnly ? 1 : 0)}
                onUpdateFilters={onUpdateFilters}
                connectionSearchTerm={connectionSearch}
                onConnectionSearchChange={setConnectionSearch}
              />

              {/* Time Range Picker */}
              <TimeRangePicker
                value={{ from, to }}
                onChange={onTimeRangeChange}
              />
            </div>
          </Page.Header.Right>
        )}
      </Page.Header>

      {/* Tabs + Streaming indicator */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <CollectionTabs
          tabs={tabs}
          activeTab={tab}
          onTabChange={(tabId) => onTabChange(tabId as "overview" | "audit")}
        />
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={onStreamingToggle}
        >
          {isStreaming ? (
            <>
              <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>
                Live{" "}
                <span className="text-muted-foreground/60 tabular-nums">
                  {MONITORING_CONFIG.streamingRefetchInterval / 1000}s
                </span>
              </span>
              <PauseCircle size={14} />
            </>
          ) : (
            <>
              <span className="size-1.5 rounded-full bg-muted-foreground/40" />
              <span>Paused</span>
              <PlayCircle size={14} />
            </>
          )}
        </button>
      </div>

      {tab === "audit" ? (
        <AuditTabContent
          client={client}
          locator={locator}
          baseParams={baseParams}
          pageSize={pageSize}
          isStreaming={isStreaming}
          streamingRefetchInterval={streamingRefetchInterval}
          connectionIds={connectionIds}
          virtualMcpIds={virtualMcpIds}
          tool={tool}
          status={status}
          searchQuery={searchQuery}
          onUpdateFilters={onUpdateFilters}
          allConnections={allConnections}
          allVirtualMcps={allVirtualMcps}
          membersData={membersData}
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-auto min-w-0 min-h-0">
          {/* KPI Summary Row */}
          <MonitoringStats
            displayDateRange={displayDateRange}
            connectionIds={connectionIds}
            excludeConnectionIds={excludeConnectionIds}
            toolName={tool || undefined}
            status={
              status === "errors"
                ? "error"
                : status === "success"
                  ? "success"
                  : undefined
            }
            connections={allConnections}
            isStreaming={isStreaming}
          />

          {/* Activity Breakdown: Connections, Tools, Agents, Automations */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={<ActivityBreakdown.Skeleton />}>
              <ActivityBreakdown
                displayDateRange={displayDateRange}
                connectionIds={connectionIds}
                excludeConnectionIds={excludeConnectionIds}
                toolName={tool || undefined}
                status={
                  status === "errors"
                    ? "error"
                    : status === "success"
                      ? "success"
                      : undefined
                }
                connections={allConnections}
                isStreaming={isStreaming}
                onToolClick={(toolName) =>
                  onUpdateFilters({
                    tab: "audit",
                    tool: toolName,
                  })
                }
              />
            </Suspense>
          </ErrorBoundary>

          {/* AI Usage */}
          <LlmStats
            displayDateRange={displayDateRange}
            isStreaming={isStreaming}
          />
        </div>
      )}
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
    tab = "overview",
    from,
    to,
    connectionId: connectionIds = [],
    virtualMcpId: virtualMcpIds = [],
    tool,
    search: searchQuery,
    status,
    streaming = true,
    propertyFilters: propertyFiltersStr = "",
    hideSystem = false,
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

  const startDate = fromResult.date || new Date(Date.now() - 30 * 60 * 1000);
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
  if (virtualMcpIds.length > 0) activeFiltersCount++;
  if (tool) activeFiltersCount++;
  if (status !== "all") activeFiltersCount++;
  if (hideSystem) activeFiltersCount++;
  // Count property filters with non-empty keys
  const validPropertyFilters = propertyFilters.filter((f) => f.key.trim());
  if (validPropertyFilters.length > 0)
    activeFiltersCount += validPropertyFilters.length;

  return (
    <Page>
      <ErrorBoundary
        fallback={
          <>
            <Page.Header>
              <Page.Header.Left>
                <h1 className="text-sm font-medium text-foreground">
                  Monitoring
                </h1>
              </Page.Header.Left>
            </Page.Header>
            <Page.Content>
              <div className="flex flex-col overflow-auto md:overflow-hidden h-full">
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
            </Page.Content>
          </>
        }
      >
        <Suspense
          fallback={
            <>
              <Page.Header>
                <Page.Header.Left>
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbPage>Monitoring</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </Page.Header.Left>
              </Page.Header>

              {/* Tabs */}
              <div className="px-5 py-3 border-b border-border">
                <CollectionTabs
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "audit", label: "Audit" },
                  ]}
                  activeTab={tab}
                  onTabChange={(tabId) =>
                    updateFilters({
                      tab: tabId as "overview" | "audit",
                    })
                  }
                />
              </div>

              {tab === "audit" ? (
                <div className="flex-1 flex flex-col overflow-auto md:overflow-hidden">
                  <MonitoringLogsTable.Skeleton />
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-auto">
                  <MonitoringStats.Skeleton />
                  <ActivityBreakdown.Skeleton />
                  <LlmStats.Skeleton />
                </div>
              )}
            </>
          }
        >
          <MonitoringDashboardContent
            tab={tab}
            dateRange={dateRange}
            displayDateRange={displayDateRange}
            connectionIds={connectionIds}
            virtualMcpIds={virtualMcpIds}
            tool={tool}
            status={status}
            search={searchQuery}
            streaming={streaming}
            hideSystem={hideSystem}
            activeFiltersCount={activeFiltersCount}
            from={from}
            to={to}
            propertyFilters={propertyFilters}
            onUpdateFilters={updateFilters}
            onTimeRangeChange={handleTimeRangeChange}
            onStreamingToggle={() => updateFilters({ streaming: !streaming })}
            onTabChange={(newTab) => updateFilters({ tab: newTab })}
          />
        </Suspense>
      </ErrorBoundary>
    </Page>
  );
}

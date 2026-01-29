/**
 * Dashboard View Component
 *
 * Displays a single dashboard with its widgets and aggregated data.
 */

import { KEYS } from "@/web/lib/query-keys";
import {
  useMCPClient,
  useProjectContext,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import {
  TimeRangePicker,
  type TimeRange as TimeRangeValue,
} from "@deco/ui/components/time-range-picker.tsx";
import { expressionToDate } from "@deco/ui/lib/time-expressions.ts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { ArrowLeft, RefreshCw01 } from "@untitledui/icons";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useQueryClient } from "@tanstack/react-query";

// ============================================================================
// Types
// ============================================================================

interface Widget {
  id: string;
  name: string;
  type: "metric" | "timeseries" | "table";
  source: {
    path: string;
    from: "input" | "output";
  };
  aggregation: {
    fn: string;
    groupBy?: string;
    interval?: string;
  };
}

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  widgets: Widget[];
}

interface WidgetResult {
  widgetId: string;
  value: number | null;
  groups?: Array<{ key: string; value: number }>;
  timeseries?: Array<{ timestamp: string; value: number }>;
}

interface QueryResponse {
  dashboardId: string;
  results: WidgetResult[];
  timeRange: {
    startDate: string;
    endDate: string;
  };
}

// ============================================================================
// Widget Components
// ============================================================================

function MetricWidget({
  widget,
  result,
}: {
  widget: Widget;
  result: WidgetResult | undefined;
}) {
  const value = result?.value ?? 0;
  const formattedValue =
    value >= 1000000
      ? `${(value / 1000000).toFixed(2)}M`
      : value >= 1000
        ? `${(value / 1000).toFixed(2)}K`
        : value.toFixed(2);

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-sm text-muted-foreground mb-1">{widget.name}</div>
      <div className="text-3xl font-bold tabular-nums">{formattedValue}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {widget.aggregation.fn}({widget.source.path})
      </div>
    </div>
  );
}

function TableWidget({
  widget,
  result,
}: {
  widget: Widget;
  result: WidgetResult | undefined;
}) {
  const groups = result?.groups ?? [];

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="font-medium">{widget.name}</div>
        <div className="text-xs text-muted-foreground">
          Grouped by {widget.aggregation.groupBy}
        </div>
      </div>
      <div className="max-h-[300px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Key</th>
              <th className="text-right px-4 py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No data
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.key} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{group.key}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {group.value.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimeseriesWidget({
  widget,
  result,
}: {
  widget: Widget;
  result: WidgetResult | undefined;
}) {
  const timeseries = result?.timeseries ?? [];

  // Simple bar chart visualization
  const maxValue = Math.max(...timeseries.map((t) => t.value), 1);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="font-medium">{widget.name}</div>
        <div className="text-xs text-muted-foreground">
          {widget.aggregation.fn} per {widget.aggregation.interval}
        </div>
      </div>
      <div className="p-4">
        {timeseries.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-muted-foreground">
            No data
          </div>
        ) : (
          <div className="flex items-end gap-1 h-[120px]">
            {timeseries.map((point, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/80 rounded-t transition-all hover:bg-primary"
                style={{
                  height: `${(point.value / maxValue) * 100}%`,
                  minHeight: point.value > 0 ? "4px" : "0px",
                }}
                title={`${new Date(point.timestamp).toLocaleString()}: ${point.value}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard View Content
// ============================================================================

interface DashboardViewContentProps {
  dashboardId: string;
  timeRange: { from: string; to: string };
}

function DashboardViewContent({
  dashboardId,
  timeRange,
}: DashboardViewContentProps) {
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Parse time range
  const fromResult = expressionToDate(timeRange.from);
  const toResult = expressionToDate(timeRange.to);
  const startDate =
    fromResult.date || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endDate = toResult.date || new Date();

  // Fetch dashboard details
  const { data: dashboard } = useSuspenseQuery({
    queryKey: KEYS.monitoringDashboardDetails(locator, dashboardId),
    queryFn: async () => {
      if (!client) throw new Error("MCP client not available");
      const result = (await client.callTool({
        name: "MONITORING_DASHBOARD_GET",
        arguments: { id: dashboardId },
      })) as { structuredContent?: Dashboard };
      return (result.structuredContent ?? result) as Dashboard | null;
    },
  });

  // Fetch query results
  const { data: queryData, isRefetching } = useSuspenseQuery({
    queryKey: KEYS.monitoringDashboardQuery(
      locator,
      dashboardId,
      startDate.toISOString(),
      endDate.toISOString(),
    ),
    queryFn: async () => {
      if (!client) throw new Error("MCP client not available");
      const result = (await client.callTool({
        name: "MONITORING_DASHBOARD_QUERY",
        arguments: {
          dashboardId,
          timeRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      })) as { structuredContent?: QueryResponse };
      return (result.structuredContent ?? result) as QueryResponse;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (!dashboard) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Dashboard not found
      </div>
    );
  }

  // Create a map of widget results
  const resultsMap = new Map(
    queryData?.results?.map((r) => [r.widgetId, r]) ?? [],
  );

  return (
    <div className="flex-1 flex flex-col overflow-auto p-5">
      {/* Dashboard Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{dashboard.name}</h2>
        {dashboard.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {dashboard.description}
          </p>
        )}
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboard.widgets.map((widget) => {
          const result = resultsMap.get(widget.id);

          if (widget.type === "metric") {
            return (
              <MetricWidget key={widget.id} widget={widget} result={result} />
            );
          }
          if (widget.type === "table") {
            return (
              <TableWidget key={widget.id} widget={widget} result={result} />
            );
          }
          if (widget.type === "timeseries") {
            return (
              <TimeseriesWidget
                key={widget.id}
                widget={widget}
                result={result}
              />
            );
          }
          return null;
        })}
      </div>

      {/* Loading overlay during refresh */}
      {isRefetching && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg px-3 py-2 shadow-lg flex items-center gap-2 text-sm">
          <RefreshCw01 size={14} className="animate-spin" />
          Refreshing...
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface DashboardViewProps {
  dashboardId: string;
  onBack: () => void;
}

export function DashboardView({ dashboardId, onBack }: DashboardViewProps) {
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState<TimeRangeValue>({
    from: "now-24h",
    to: "now",
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "monitoringDashboardQuery" &&
        query.queryKey[2] === dashboardId,
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-background">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} className="mr-1.5" />
          Back to Dashboards
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw01 size={14} className="mr-1.5" />
            Refresh
          </Button>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Content */}
      <ErrorBoundary
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Failed to load dashboard
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw01
                size={24}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <DashboardViewContent
            dashboardId={dashboardId}
            timeRange={timeRange}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

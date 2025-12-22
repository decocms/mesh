/**
 * Home Page Monitoring KPIs
 *
 * Uses the shared MonitoringStatsRow component with 24h data.
 */

import { createToolCaller } from "@/tools/client";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getLast24HoursDateRange } from "@/web/utils/date-range";
import {
  MonitoringStatsRow,
  MonitoringStatsRowSkeleton,
  calculateStats,
  type KPIType,
  type MonitoringLogsResponse,
  type MonitoringStatsData,
} from "@/web/components/monitoring/monitoring-stats-row.tsx";
import { useNavigate } from "@tanstack/react-router";

// Mock stats for empty state display
function getMockStats(startDate: Date, endDate: Date): MonitoringStatsData {
  const buckets = 24;
  const msPerBucket = (endDate.getTime() - startDate.getTime()) / buckets;

  const data = Array.from({ length: buckets }, (_, i) => {
    const bucketStart = new Date(startDate.getTime() + i * msPerBucket);
    // Create realistic-looking mock data with some variation
    const baseCalls = Math.floor(Math.random() * 15) + 5;
    const calls =
      i < 20 ? baseCalls : baseCalls + Math.floor(Math.random() * 20);
    const errors = Math.random() > 0.85 ? Math.floor(Math.random() * 3) : 0;
    const errorRate = calls > 0 ? (errors / calls) * 100 : 0;
    const p95 = Math.floor(Math.random() * 300) + 100;

    return {
      t: bucketStart.toISOString(),
      ts: bucketStart.getTime(),
      label: bucketStart.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      calls,
      errors,
      errorRate,
      p95,
    };
  });

  const totalCalls = data.reduce((sum, d) => sum + d.calls, 0);
  const totalErrors = data.reduce((sum, d) => sum + d.errors, 0);
  const avgDurationMs = Math.floor(
    data.reduce((sum, d) => sum + d.p95, 0) / data.length,
  );

  return { totalCalls, totalErrors, avgDurationMs, data };
}

function MonitoringKPIsContent() {
  const { locator, org } = useProjectContext();
  const navigate = useNavigate();
  const toolCaller = createToolCaller();
  const dateRange = getLast24HoursDateRange();

  const { data: logsData } = useToolCall<
    { startDate: string; endDate: string; limit: number; offset: number },
    MonitoringLogsResponse
  >({
    toolCaller,
    toolName: "MONITORING_LOGS_LIST",
    toolInputParams: { ...dateRange, limit: 750, offset: 0 },
    scope: locator,
    staleTime: 30_000,
  });

  const logs = logsData?.logs ?? [];
  const start = new Date(dateRange.startDate);
  const end = new Date(dateRange.endDate);

  // Use mock data when there are no logs
  const stats =
    logs.length === 0
      ? getMockStats(start, end)
      : calculateStats(
          logs,
          { startDate: start, endDate: end },
          24,
          logsData?.total,
        );

  const handleKPIClick = (kpiType: KPIType) => {
    if (kpiType === "errors") {
      navigate({
        to: "/$org/monitoring",
        params: { org: org.slug },
        search: { status: "errors" },
      });
    } else {
      navigate({
        to: "/$org/monitoring",
        params: { org: org.slug },
      });
    }
  };

  return (
    <MonitoringStatsRow
      stats={stats}
      chartHeight="h-[103px]"
      showDateLabels
      dateRange={{ startDate: start, endDate: end }}
      onKPIClick={handleKPIClick}
    />
  );
}

export const MonitoringKPIs = {
  Content: MonitoringKPIsContent,
  Skeleton: MonitoringStatsRowSkeleton,
};

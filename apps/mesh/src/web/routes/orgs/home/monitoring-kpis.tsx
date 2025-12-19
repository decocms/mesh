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
  type MonitoringLogsResponse,
} from "@/web/components/monitoring/monitoring-stats-row.tsx";

function MonitoringKPIsContent() {
  const { locator } = useProjectContext();
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

  return (
    <MonitoringStatsRow
      stats={calculateStats(
        logs,
        { startDate: start, endDate: end },
        24,
        logsData?.total,
      )}
      chartHeight="h-[103px]"
      showDateLabels
      dateRange={{ startDate: start, endDate: end }}
    />
  );
}

export const MonitoringKPIs = {
  Content: MonitoringKPIsContent,
  Skeleton: MonitoringStatsRowSkeleton,
};

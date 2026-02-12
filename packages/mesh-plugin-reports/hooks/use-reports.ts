/**
 * Hooks for fetching report data via the REPORTS_BINDING tools.
 */

import { useQuery } from "@tanstack/react-query";
import {
  REPORTS_BINDING,
  type ReportsListOutput,
  type Report,
} from "@decocms/bindings";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { KEYS } from "../lib/query-keys";

/**
 * Fetch the list of all reports with optional filters.
 */
export function useReportsList(options?: {
  category?: string;
  status?: string;
}) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof REPORTS_BINDING>();

  return useQuery({
    queryKey: KEYS.reportsList(
      connectionId,
      options?.category,
      options?.status,
    ),
    queryFn: async (): Promise<ReportsListOutput> => {
      const result = await toolCaller("REPORTS_LIST", {
        category: options?.category,
        status: options?.status as
          | "passing"
          | "warning"
          | "failing"
          | "info"
          | undefined,
      });
      return result;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch a single report by ID with full content and actions.
 */
export function useReport(reportId: string) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof REPORTS_BINDING>();

  return useQuery({
    queryKey: KEYS.report(connectionId, reportId),
    queryFn: async (): Promise<Report> => {
      const result = await toolCaller("REPORTS_GET", { id: reportId });
      return result;
    },
    enabled: !!reportId,
    staleTime: 60 * 1000, // 1 minute
  });
}

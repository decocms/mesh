/**
 * Report Detail Component
 *
 * Displays a single report with its full content:
 * - Header with title, status, category, source, timestamp
 * - Sections rendered by ReportSectionRenderer
 *
 * Automatically marks the report as read on mount via REPORTS_UPDATE_STATUS.
 * Provides a "Mark as done" button that dismisses the report.
 */

import { REPORTS_BINDING, type ReportStatus } from "@decocms/bindings";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CheckDone01,
  Clock,
  InfoCircle,
  Loading01,
  XCircle,
} from "@untitledui/icons";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useReport } from "../hooks/use-reports";
import { KEYS } from "../lib/query-keys";
import { ReportSectionRenderer } from "./report-sections";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  passing: {
    label: "Passing",
    color:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    icon: CheckCircle,
  },
  warning: {
    label: "Warning",
    color:
      "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
    icon: AlertCircle,
  },
  failing: {
    label: "Failing",
    color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
    icon: XCircle,
  },
  info: {
    label: "Info",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
    icon: InfoCircle,
  },
};

function StatusBadge({ status }: { status: ReportStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        cfg.color,
      )}
    >
      <Icon size={14} />
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ReportDetail({
  reportId,
  onBack,
}: {
  reportId: string;
  onBack: () => void;
}) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof REPORTS_BINDING>();
  const queryClient = useQueryClient();
  const { data: report, isLoading, error } = useReport(reportId);
  const markedReadRef = useRef(false);

  // Auto-mark as read when the detail view mounts
  useEffect(() => {
    if (markedReadRef.current) return;
    markedReadRef.current = true;

    toolCaller("REPORTS_UPDATE_STATUS", {
      reportId,
      lifecycleStatus: "read",
    })
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: KEYS.reportsList(connectionId),
        });
      })
      .catch(() => {
        // Silently ignore -- server may not implement this optional tool
      });
  }, [reportId, connectionId, toolCaller, queryClient]);

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async () => {
      return toolCaller("REPORTS_UPDATE_STATUS", {
        reportId,
        lifecycleStatus: "dismissed",
      });
    },
    onSuccess: () => {
      toast.success("Report marked as done");
      queryClient.invalidateQueries({
        queryKey: KEYS.reportsList(connectionId),
      });
      onBack();
    },
    onError: (err) => {
      toast.error(`Failed to dismiss report: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">
          {error ? "Error loading report" : "Report not found"}
        </h3>
        <p className="text-muted-foreground text-center mb-4">
          {error?.message ?? "The requested report could not be found."}
        </p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft size={14} className="mr-1" />
          Back to reports
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 space-y-3">
        {/* Breadcrumb + dismiss */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Reports
          </button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
          >
            {dismissMutation.isPending ? (
              <Loading01 size={14} className="animate-spin" />
            ) : (
              <CheckDone01 size={14} />
            )}
            Mark as done
          </Button>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl font-semibold leading-tight">
              {report.title}
            </h1>
            <p className="text-sm text-muted-foreground">{report.summary}</p>
          </div>
          <StatusBadge status={report.status} />
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="capitalize">{report.category}</span>
          {report.source && (
            <>
              <span className="text-border">|</span>
              <span>{report.source}</span>
            </>
          )}
          <span className="text-border">|</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {formatDate(report.updatedAt)}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 px-6 py-6 space-y-8">
        {report.sections.map((section, idx) => (
          <ReportSectionRenderer key={idx} section={section} />
        ))}
      </div>
    </div>
  );
}

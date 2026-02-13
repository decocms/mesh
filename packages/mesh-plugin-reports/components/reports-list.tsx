/**
 * Reports List Component
 *
 * Inbox-style landing page for the reports plugin.
 * Splits reports into Inbox (active) and Done (dismissed) tabs.
 * Unread reports are visually prominent with bold titles and accent dots.
 * Each card has a quick-dismiss checkmark button.
 */

import {
  REPORTS_BINDING,
  type ReportStatus,
  type ReportSummary,
} from "@decocms/bindings";
import { Badge } from "@deco/ui/components/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  CheckDone01,
  Clock,
  FileCheck02,
  Inbox01,
  Loading01,
} from "@untitledui/icons";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useReportsList } from "../hooks/use-reports";
import { KEYS } from "../lib/query-keys";
import { STATUS_CONFIG, StatusBadge } from "./status-badge";

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Report Card
// ---------------------------------------------------------------------------

function ReportCard({
  report,
  isDoneTab,
  onSelect,
  onDismiss,
}: {
  report: ReportSummary;
  isDoneTab: boolean;
  onSelect: (id: string) => void;
  onDismiss: (id: string, dismissed: boolean) => void;
}) {
  const isUnread =
    !report.lifecycleStatus || report.lifecycleStatus === "unread";

  return (
    <Card
      className={cn(
        "group relative cursor-pointer transition-shadow",
        isDoneTab ? "opacity-60" : "hover:shadow-md",
      )}
      onClick={() => onSelect(report.id)}
    >
      {/* Unread accent dot */}
      {isUnread && (
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-primary" />
      )}

      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle
            className={cn(
              "text-sm leading-snug line-clamp-2",
              isUnread && "font-bold",
            )}
          >
            {report.title}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge status={report.status} size="sm" />
            {/* Quick dismiss / restore button */}
            <button
              type="button"
              title={isDoneTab ? "Restore to inbox" : "Mark as done"}
              className={cn(
                "rounded-md p-1 transition-colors",
                isDoneTab
                  ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                  : "text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-emerald-600 hover:bg-emerald-500/10",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(report.id, !isDoneTab);
              }}
            >
              <CheckDone01 size={14} />
            </button>
          </div>
        </div>
        <CardDescription className="mt-1 line-clamp-2 text-xs">
          {report.summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 capitalize">
              {report.category}
            </span>
            {report.source && (
              <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                {report.source}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {formatTimeAgo(report.updatedAt)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function Filters({
  category,
  status,
  categories,
  onCategoryChange,
  onStatusChange,
}: {
  category?: string;
  status?: ReportStatus;
  categories: string[];
  onCategoryChange: (value: string | undefined) => void;
  onStatusChange: (value: ReportStatus | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={category ?? "__all__"}
        onValueChange={(v) => onCategoryChange(v === "__all__" ? undefined : v)}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All categories</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat}>
              <span className="capitalize">{cat}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status ?? "__all__"}
        onValueChange={(v) =>
          onStatusChange(v === "__all__" ? undefined : (v as ReportStatus))
        }
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          {(Object.keys(STATUS_CONFIG) as ReportStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function ReportsList({
  onSelectReport,
}: {
  onSelectReport: (id: string) => void;
}) {
  const [tab, setTab] = useState<"inbox" | "done">("inbox");
  const [category, setCategory] = useState<string | undefined>();
  const [status, setStatus] = useState<ReportStatus | undefined>();

  const { connectionId, toolCaller } =
    usePluginContext<typeof REPORTS_BINDING>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useReportsList({ category, status });
  const allReports = data?.reports ?? [];

  // Split into inbox / done
  const inboxReports = allReports.filter(
    (r) => r.lifecycleStatus !== "dismissed",
  );
  const doneReports = allReports.filter(
    (r) => r.lifecycleStatus === "dismissed",
  );
  const visibleReports = tab === "inbox" ? inboxReports : doneReports;
  const unreadCount = inboxReports.filter(
    (r) => !r.lifecycleStatus || r.lifecycleStatus === "unread",
  ).length;

  // Derive unique categories from the full list
  const { data: allData } = useReportsList();
  const categories = [
    ...new Set((allData?.reports ?? []).map((r) => r.category)),
  ].sort();

  // Dismiss / restore mutation
  const dismissMutation = useMutation({
    mutationFn: async ({
      reportId,
      lifecycleStatus,
    }: {
      reportId: string;
      lifecycleStatus: "read" | "dismissed";
    }) => {
      return toolCaller("REPORTS_UPDATE_STATUS", { reportId, lifecycleStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.reportsList(connectionId),
      });
    },
    onError: (err) => {
      toast.error(`Failed to update report: ${err.message}`);
    },
  });

  const handleDismiss = (reportId: string, dismissed: boolean) => {
    dismissMutation.mutate({
      reportId,
      lifecycleStatus: dismissed ? "dismissed" : "read",
    });
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading reports</h3>
        <p className="text-muted-foreground text-center">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-1">
          {/* Inbox tab */}
          <button
            type="button"
            onClick={() => setTab("inbox")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "inbox"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <Inbox01 size={14} />
            Inbox
            {!isLoading && unreadCount > 0 && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                {unreadCount}
              </Badge>
            )}
          </button>

          {/* Done tab */}
          <button
            type="button"
            onClick={() => setTab("done")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "done"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <CheckDone01 size={14} />
            Done
            {!isLoading && doneReports.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {doneReports.length}
              </span>
            )}
          </button>
        </div>

        <Filters
          category={category}
          status={status}
          categories={categories}
          onCategoryChange={setCategory}
          onStatusChange={setStatus}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground mb-4"
            />
            <p className="text-sm text-muted-foreground">Loading reports...</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {tab === "done" ? (
              <>
                <CheckDone01 size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  No dismissed reports
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Reports you mark as done will appear here.
                </p>
              </>
            ) : (
              <>
                <FileCheck02 size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {category || status
                    ? "No reports match filters"
                    : "Inbox is empty"}
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  {category || status
                    ? "Try adjusting your filters."
                    : "Reports will appear here once the connected MCP server provides them."}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                isDoneTab={tab === "done"}
                onSelect={onSelectReport}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

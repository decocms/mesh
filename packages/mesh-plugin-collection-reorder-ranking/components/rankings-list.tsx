/**
 * Rankings List Component
 *
 * Lists all reports from the Reports MCP. Click a report to view its detail.
 */

import type { ReportSummary } from "@decocms/bindings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { Clock } from "@untitledui/icons";
import { AlertCircle, BarChart01, Loading01 } from "@untitledui/icons";
import { useRankingReportsList } from "../hooks/use-ranking-reports";
import { StatusBadge } from "./status-badge";

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

function ReportCard({
  report,
  onSelect,
}: {
  report: ReportSummary;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      className="group relative cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onSelect(report.id)}
    >
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm leading-snug line-clamp-2">
            {report.title}
          </CardTitle>
          <StatusBadge status={report.status} size="sm" />
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
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {formatTimeAgo(report.updatedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RankingsList({
  onSelectReport,
}: {
  onSelectReport: (id: string) => void;
}) {
  const { data, isLoading, error } = useRankingReportsList();
  const reports = data?.reports ?? [];

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
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">All Reports</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground mb-4"
            />
            <p className="text-sm text-muted-foreground">Loading reports...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BarChart01 size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No reports yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Reports will appear here once the connected MCP server provides
              them.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onSelect={onSelectReport}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

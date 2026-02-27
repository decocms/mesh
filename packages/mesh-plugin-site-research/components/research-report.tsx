import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft, Loading01 } from "@untitledui/icons";
import { ReportSectionRenderer } from "mesh-plugin-reports/components/report-sections";
import { KEYS } from "../lib/query-keys";
import { readFile } from "../lib/storage";
import type { SiteResearchReport } from "../lib/types";
import HireAgentCta from "./hire-agent-cta";
import { Fragment } from "react";

interface ResearchReportProps {
  sessionId: string;
  onBack: () => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : score >= 50
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-red-500/15 text-red-700 dark:text-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold tabular-nums",
        color,
      )}
    >
      {score}/100
    </span>
  );
}

export default function ResearchReport({
  sessionId,
  onBack,
}: ResearchReportProps) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  const { data: report, isLoading } = useQuery({
    queryKey: KEYS.report(connectionId, sessionId),
    queryFn: () =>
      readFile<SiteResearchReport>(toolCaller, sessionId, "report.json"),
    enabled: !!sessionId,
    staleTime: 60 * 1000,
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

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-sm text-muted-foreground">Report not found</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  // Build a map of agent suggestions by section index
  const suggestionsByIndex = new Map<number, typeof report.agentSuggestions>();
  for (const suggestion of report.agentSuggestions) {
    const existing = suggestionsByIndex.get(suggestion.afterSectionIndex) ?? [];
    existing.push(suggestion);
    suggestionsByIndex.set(suggestion.afterSectionIndex, existing);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center size-8 rounded-lg hover:bg-accent transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {report.url}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analyzed{" "}
              {new Date(report.analyzedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <ScoreBadge score={report.overallScore} />
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-8">
          {report.sections.map((section, idx) => (
            <Fragment key={idx}>
              <ReportSectionRenderer section={section} />
              {suggestionsByIndex.get(idx)?.map((suggestion) => (
                <HireAgentCta
                  key={suggestion.agentId}
                  suggestion={suggestion}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

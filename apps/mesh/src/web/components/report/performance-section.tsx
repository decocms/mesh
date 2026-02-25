/**
 * PerformanceSection — displays Core Web Vitals and performance scores
 * from the WebPerformanceResult diagnostic agent.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import type { WebPerformanceResult } from "@/diagnostic/types";

// ============================================================================
// Helpers
// ============================================================================

type Rating = "good" | "needs-improvement" | "poor";

function ratingColor(rating: Rating | undefined): string {
  if (rating === "good") return "text-emerald-600";
  if (rating === "needs-improvement") return "text-amber-500";
  if (rating === "poor") return "text-red-500";
  return "text-muted-foreground";
}

function ratingBg(rating: Rating | undefined): string {
  if (rating === "good") return "bg-emerald-50 border-emerald-200";
  if (rating === "needs-improvement") return "bg-amber-50 border-amber-200";
  if (rating === "poor") return "bg-red-50 border-red-200";
  return "bg-muted border-border";
}

function ratingLabel(rating: Rating | undefined): string {
  if (rating === "good") return "Good";
  if (rating === "needs-improvement") return "Needs Improvement";
  if (rating === "poor") return "Poor";
  return "No data";
}

function scoreColor(score: number | undefined): string {
  if (score === undefined) return "text-muted-foreground";
  if (score >= 90) return "text-emerald-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

// ============================================================================
// Sub-components
// ============================================================================

interface MetricCardProps {
  name: string;
  shortName: string;
  value: string | null;
  rating: Rating | undefined;
  description: string;
}

function MetricCard({
  name,
  shortName,
  value,
  rating,
  description,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        rating ? ratingBg(rating) : "bg-muted border-border",
      )}
    >
      <dt>
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {shortName}
        </span>
        <span className="mt-0.5 block text-sm text-foreground">{name}</span>
      </dt>
      <dd className="mt-3">
        {value ? (
          <>
            <span className={cn("text-3xl font-bold", ratingColor(rating))}>
              {value}
            </span>
            <span
              className={cn(
                "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
                ratingColor(rating),
              )}
            >
              {ratingLabel(rating)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No data</span>
        )}
      </dd>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

interface ScoreBadgeProps {
  label: string;
  score: number | undefined;
}

function ScoreBadge({ label, score }: ScoreBadgeProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-current">
        <span className={cn("text-lg font-bold", scoreColor(score))}>
          {score ?? "—"}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className={cn("text-xs", scoreColor(score))}>
          {score === undefined
            ? "No data"
            : score >= 90
              ? "Good"
              : score >= 50
                ? "Needs work"
                : "Poor"}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface PerformanceSectionProps {
  data: WebPerformanceResult | null | undefined;
}

export function PerformanceSection({ data }: PerformanceSectionProps) {
  if (!data) {
    return (
      <section aria-labelledby="performance-heading">
        <h2
          id="performance-heading"
          className="text-xl font-semibold text-foreground"
        >
          Performance
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No performance data available for this report.
        </p>
      </section>
    );
  }

  const lcpValue = data.lcp ? `${(data.lcp.value / 1000).toFixed(1)}s` : null;
  const inpValue = data.inp ? `${data.inp.value}ms` : null;
  const clsValue = data.cls ? data.cls.value.toFixed(2) : null;

  const imageIssueCount = data.imageAudit?.issues?.length ?? 0;
  const highSeverityCount =
    data.imageAudit?.issues?.filter((i) => i.severity === "high").length ?? 0;

  return (
    <section aria-labelledby="performance-heading">
      <h2
        id="performance-heading"
        className="text-xl font-semibold text-foreground"
      >
        Performance
      </h2>

      {/* Core Web Vitals */}
      <div className="mt-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Core Web Vitals
        </h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            shortName="LCP"
            name="Largest Contentful Paint"
            value={lcpValue}
            rating={data.lcp?.rating}
            description="Time for the largest visible element to load"
          />
          <MetricCard
            shortName="INP"
            name="Interaction to Next Paint"
            value={inpValue}
            rating={data.inp?.rating}
            description="Responsiveness to user interactions"
          />
          <MetricCard
            shortName="CLS"
            name="Cumulative Layout Shift"
            value={clsValue}
            rating={data.cls?.rating}
            description="Visual stability — how much elements move"
          />
        </dl>
      </div>

      {/* Performance scores */}
      {(data.mobileScore !== undefined || data.desktopScore !== undefined) && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            PageSpeed Scores
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <ScoreBadge label="Mobile" score={data.mobileScore} />
            <ScoreBadge label="Desktop" score={data.desktopScore} />
          </div>
        </div>
      )}

      {/* Image audit */}
      {data.imageAudit && imageIssueCount > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Image Audit
          </h3>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{imageIssueCount}</span> image{" "}
              {imageIssueCount === 1 ? "issue" : "issues"} found across{" "}
              {data.imageAudit.totalImages} images
              {highSeverityCount > 0 && (
                <span className="ml-1 font-medium text-red-700">
                  ({highSeverityCount} high severity)
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

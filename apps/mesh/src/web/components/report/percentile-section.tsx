/**
 * PercentileSection — mocked percentile comparison vs other storefronts (DIAG-10).
 *
 * Displays hardcoded realistic percentile data. This section is unlocked in a
 * future Pro version — it is clearly marked with a ProBadge.
 *
 * All data below is MOCKED / ILLUSTRATIVE — not sourced from live benchmarking.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { ProBadge } from "@/web/components/report/pro-badge";

// ============================================================================
// Mocked data (static constants — all illustrative)
// ============================================================================

const OVERALL_PERCENTILE = 67;

const CATEGORY_PERCENTILES = [
  { label: "Performance", percentile: 72, color: "bg-emerald-500" },
  { label: "SEO", percentile: 58, color: "bg-amber-500" },
  { label: "Tech Stack", percentile: 81, color: "bg-emerald-500" },
  { label: "Content", percentile: 45, color: "bg-amber-500" },
] as const;

// ============================================================================
// Helpers
// ============================================================================

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const r = n % 10;
  if (r === 1) return `${n}st`;
  if (r === 2) return `${n}nd`;
  if (r === 3) return `${n}rd`;
  return `${n}th`;
}

function percentileLabel(pct: number): string {
  if (pct >= 75) return "Top quartile";
  if (pct >= 50) return "Above average";
  if (pct >= 25) return "Below average";
  return "Needs improvement";
}

// ============================================================================
// Sub-components
// ============================================================================

function OverallPercentileCard() {
  return (
    <div className="flex items-center gap-5 rounded-lg border border-border bg-background p-5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-violet-400 text-center">
        <div>
          <span className="block text-xl font-bold text-violet-700">
            {OVERALL_PERCENTILE}
          </span>
          <span className="block text-xs text-muted-foreground leading-none">
            th
          </span>
        </div>
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">
          {ordinalSuffix(OVERALL_PERCENTILE)} Percentile Overall
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your storefront outperforms{" "}
          <span className="font-medium text-foreground">
            {OVERALL_PERCENTILE}%
          </span>{" "}
          of analyzed storefronts.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {percentileLabel(OVERALL_PERCENTILE)} — based on{" "}
          <span className="font-medium">12,400+</span> storefronts analyzed.
        </p>
      </div>
    </div>
  );
}

function CategoryBars() {
  return (
    <div className="mt-6">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Category Breakdown
      </h3>
      <ul className="space-y-3">
        {CATEGORY_PERCENTILES.map((cat) => (
          <li key={cat.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{cat.label}</span>
              <span className="text-muted-foreground">
                {ordinalSuffix(cat.percentile)} percentile
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", cat.color)}
                style={{ width: `${cat.percentile}%` }}
                role="progressbar"
                aria-valuenow={cat.percentile}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${cat.label}: ${ordinalSuffix(cat.percentile)} percentile`}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Percentile scores compare your storefront against all storefronts in the
        MCP Mesh analysis corpus. Higher is better.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function PercentileSection() {
  return (
    <section
      aria-labelledby="percentile-heading"
      className="rounded-xl border border-violet-100 bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="percentile-heading"
          className="text-xl font-semibold text-foreground"
        >
          Storefront Percentile Ranking
        </h2>
        <ProBadge />
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        How your storefront compares to thousands of others across key
        categories.{" "}
        <span className="italic">
          Upgrade to Pro to unlock your real percentile score.
        </span>
      </p>

      <div className="mt-5 opacity-70">
        <OverallPercentileCard />
        <CategoryBars />
      </div>
    </section>
  );
}

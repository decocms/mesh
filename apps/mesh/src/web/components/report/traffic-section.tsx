/**
 * TrafficSection — mocked traffic volume and competitor comparison (DIAG-07).
 *
 * Displays hardcoded realistic traffic data. This section is unlocked in a
 * future Pro version — it is clearly marked with a ProBadge to create
 * upgrade motivation.
 *
 * All data below is MOCKED / ILLUSTRATIVE — not sourced from live analytics.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { ProBadge } from "@/web/components/report/pro-badge";

// ============================================================================
// Mocked data (static constants — all illustrative)
// ============================================================================

const MONTHLY_VISITS = "~145K";
const VISIT_TREND = "+12%";
const VISIT_TREND_PERIOD = "vs last month";

const TRAFFIC_SOURCES = [
  { label: "Organic", pct: 42, color: "bg-emerald-500" },
  { label: "Direct", pct: 28, color: "bg-blue-500" },
  { label: "Paid", pct: 18, color: "bg-amber-500" },
  { label: "Social", pct: 8, color: "bg-pink-500" },
  { label: "Referral", pct: 4, color: "bg-violet-500" },
] as const;

const COMPETITORS = [
  {
    domain: "competitor-a.com",
    visits: "~210K",
    overlap: "34%",
  },
  {
    domain: "competitor-b.com",
    visits: "~98K",
    overlap: "21%",
  },
  {
    domain: "competitor-c.com",
    visits: "~172K",
    overlap: "18%",
  },
  {
    domain: "competitor-d.com",
    visits: "~55K",
    overlap: "9%",
  },
] as const;

// ============================================================================
// Sub-components
// ============================================================================

function TrafficOverviewCard() {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Estimated Monthly Visits
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-foreground">
          {MONTHLY_VISITS}
        </span>
        <span className="text-sm font-medium text-emerald-600">
          {VISIT_TREND}{" "}
          <span className="font-normal text-muted-foreground">
            {VISIT_TREND_PERIOD}
          </span>
        </span>
      </div>
    </div>
  );
}

function SourcesBreakdown() {
  return (
    <div className="mt-4">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Traffic Sources
      </h3>
      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {TRAFFIC_SOURCES.map((source) => (
          <div
            key={source.label}
            className={source.color}
            style={{ width: `${source.pct}%` }}
            title={`${source.label}: ${source.pct}%`}
          />
        ))}
      </div>
      {/* Legend */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {TRAFFIC_SOURCES.map((source) => (
          <li key={source.label} className="flex items-center gap-1.5 text-sm">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-sm",
                source.color,
              )}
            />
            <span className="font-medium text-foreground">{source.label}</span>
            <span className="text-muted-foreground">{source.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitorTable() {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Competitor Comparison
      </h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Domain
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                Est. Monthly Visits
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                Audience Overlap
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPETITORS.map((c, i) => (
              <tr
                key={c.domain}
                className={cn(
                  i < COMPETITORS.length - 1 && "border-b border-border",
                )}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                  {c.domain}
                </td>
                <td className="px-4 py-2.5 text-right text-foreground">
                  {c.visits}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                  {c.overlap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function TrafficSection() {
  return (
    <section
      aria-labelledby="traffic-heading"
      className="rounded-xl border border-violet-100 bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="traffic-heading"
          className="text-xl font-semibold text-foreground"
        >
          Traffic &amp; Competitors
        </h2>
        <ProBadge />
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Estimated traffic volume, source breakdown, and audience overlap with
        key competitors.{" "}
        <span className="italic">
          Upgrade to Pro to access live data for your storefront.
        </span>
      </p>

      <div className="mt-5 opacity-70">
        <TrafficOverviewCard />
        <SourcesBreakdown />
        <CompetitorTable />
      </div>
    </section>
  );
}

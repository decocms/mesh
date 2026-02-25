/**
 * SeoRankingsSection — mocked SEO keyword rankings and backlink data (DIAG-08).
 *
 * Displays hardcoded realistic SEO data. This section is unlocked in a
 * future Pro version — it is clearly marked with a ProBadge.
 *
 * All data below is MOCKED / ILLUSTRATIVE — not sourced from live SEO tools.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { ProBadge } from "@/web/components/report/pro-badge";

// ============================================================================
// Mocked data (static constants — all illustrative)
// ============================================================================

const KEYWORDS = [
  {
    keyword: "wireless headphones",
    position: 8,
    volume: "12,100/mo",
    url: "/products/headphones",
  },
  {
    keyword: "noise cancelling earbuds",
    position: 14,
    volume: "8,400/mo",
    url: "/products/earbuds",
  },
  {
    keyword: "bluetooth speaker portable",
    position: 6,
    volume: "6,200/mo",
    url: "/products/speakers",
  },
  {
    keyword: "headphones under 100",
    position: 21,
    volume: "5,500/mo",
    url: "/collections/budget",
  },
  {
    keyword: "audio equipment store",
    position: 3,
    volume: "2,900/mo",
    url: "/",
  },
  {
    keyword: "premium earphones review",
    position: 11,
    volume: "1,800/mo",
    url: "/blog/earphones-review",
  },
] as const;

const BACKLINK_STATS = [
  { label: "Total Backlinks", value: "2,340" },
  { label: "Referring Domains", value: "187" },
  { label: "Domain Authority", value: "42/100" },
] as const;

// ============================================================================
// Sub-components
// ============================================================================

function positionColor(position: number): string {
  if (position <= 3) return "text-emerald-600";
  if (position <= 10) return "text-amber-500";
  return "text-muted-foreground";
}

function KeywordsTable() {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Top Ranking Keywords
      </h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                Keyword
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                Position
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                Volume
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">
                URL
              </th>
            </tr>
          </thead>
          <tbody>
            {KEYWORDS.map((kw, i) => (
              <tr
                key={kw.keyword}
                className={cn(
                  i < KEYWORDS.length - 1 && "border-b border-border",
                )}
              >
                <td className="px-4 py-2.5 text-foreground">{kw.keyword}</td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-center font-bold",
                    positionColor(kw.position),
                  )}
                >
                  #{kw.position}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {kw.volume}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                  {kw.url}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BacklinkStats() {
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Backlink Summary
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {BACKLINK_STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-background p-4 text-center"
          >
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function SeoRankingsSection() {
  return (
    <section
      aria-labelledby="seo-rankings-heading"
      className="rounded-xl border border-violet-100 bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="seo-rankings-heading"
          className="text-xl font-semibold text-foreground"
        >
          SEO Rankings &amp; Backlinks
        </h2>
        <ProBadge />
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Keyword position tracking and backlink authority data.{" "}
        <span className="italic">
          Upgrade to Pro to see your live keyword rankings.
        </span>
      </p>

      <div className="mt-5 opacity-70">
        <KeywordsTable />
        <BacklinkStats />
      </div>
    </section>
  );
}

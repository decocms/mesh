/**
 * SeoSection — displays SEO signals extracted by the SEO diagnostic agent.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import type { SeoResult } from "@/diagnostic/types";

// ============================================================================
// Sub-components
// ============================================================================

function CheckIcon({ present }: { present: boolean }) {
  if (present) {
    return (
      <svg
        className="h-4 w-4 text-emerald-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    );
  }
  return (
    <svg
      className="h-4 w-4 text-red-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface SeoSectionProps {
  data: SeoResult | null | undefined;
}

export function SeoSection({ data }: SeoSectionProps) {
  if (!data) {
    return (
      <section aria-labelledby="seo-heading">
        <h2 id="seo-heading" className="text-xl font-semibold text-foreground">
          SEO
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No SEO data available for this report.
        </p>
      </section>
    );
  }

  const ogTagCount = data.ogTags ? Object.keys(data.ogTags).length : 0;
  const ogTagSummary =
    ogTagCount > 0
      ? `${ogTagCount} tag${ogTagCount !== 1 ? "s" : ""} found`
      : null;

  const h1Count =
    data.headingStructure?.filter((h) => h.tag === "h1").length ?? 0;
  const headingSummary = data.headingStructure
    ? h1Count === 0
      ? "No H1 found"
      : `${h1Count} H1${h1Count > 1 ? " (multiple)" : ""}`
    : null;

  const structuredDataCount = data.structuredData?.length ?? 0;

  return (
    <section aria-labelledby="seo-heading">
      <h2 id="seo-heading" className="text-xl font-semibold text-foreground">
        SEO
      </h2>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full">
          <tbody className="divide-y divide-border">
            <tr className="border-b border-border bg-muted/50">
              <td
                colSpan={2}
                className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                On-Page Signals
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Title
              </th>
              <td className="px-4 py-2.5 text-sm">
                {data.title ? (
                  <span className="text-foreground">{data.title}</span>
                ) : (
                  <span className="text-red-500">Missing</span>
                )}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Meta Description
              </th>
              <td className="px-4 py-2.5 text-sm">
                {data.metaDescription ? (
                  <span className="text-foreground">
                    {data.metaDescription}
                  </span>
                ) : (
                  <span className="text-red-500">Missing</span>
                )}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                OG Tags
              </th>
              <td className="px-4 py-2.5 text-sm">
                {ogTagSummary ? (
                  <span className="text-foreground">{ogTagSummary}</span>
                ) : (
                  <span className="text-muted-foreground">None found</span>
                )}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Canonical URL
              </th>
              <td className="px-4 py-2.5 text-sm break-all">
                {data.canonicalUrl ? (
                  <span className="text-foreground">{data.canonicalUrl}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Heading Structure
              </th>
              <td className="px-4 py-2.5 text-sm">
                {headingSummary ? (
                  <span
                    className={cn(
                      h1Count === 0 ? "text-red-500" : "text-foreground",
                    )}
                  >
                    {headingSummary}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No data</span>
                )}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Robots Meta
              </th>
              <td className="px-4 py-2.5 text-sm">
                {data.robotsMeta ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                    {data.robotsMeta}
                  </code>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </td>
            </tr>
            <tr className="border-b border-border bg-muted/50">
              <td
                colSpan={2}
                className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Crawlability
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                robots.txt
              </th>
              <td className="px-4 py-2.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckIcon present={!!data.hasRobotsTxt} />
                  <span
                    className={cn(
                      data.hasRobotsTxt ? "text-foreground" : "text-red-500",
                    )}
                  >
                    {data.hasRobotsTxt ? "Found" : "Not found"}
                  </span>
                </span>
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Sitemap
              </th>
              <td className="px-4 py-2.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckIcon present={!!data.hasSitemap} />
                  <span
                    className={cn(
                      data.hasSitemap ? "text-foreground" : "text-red-500",
                    )}
                  >
                    {data.hasSitemap ? "Found" : "Not found"}
                  </span>
                </span>
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-sm font-medium text-foreground w-40"
              >
                Structured Data
              </th>
              <td className="px-4 py-2.5 text-sm">
                {structuredDataCount > 0 ? (
                  <span className="text-foreground">
                    {structuredDataCount} JSON-LD schema
                    {structuredDataCount !== 1 ? "s" : ""} found
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No JSON-LD schemas found
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

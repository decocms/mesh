/**
 * CompanyContextSection — displays AI-generated company description
 * and product context from the company_context diagnostic agent.
 */

import { useParams } from "@tanstack/react-router";
import type { CompanyContextResult } from "@/diagnostic/types";

// ============================================================================
// Sub-components
// ============================================================================

function PencilIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface CompanyContextSectionProps {
  data: CompanyContextResult | null | undefined;
}

export function CompanyContextSection({ data }: CompanyContextSectionProps) {
  // Read token from URL params for the edit link
  const { token } = useParams({ from: "/report/$token" });

  if (!data) {
    return (
      <section aria-labelledby="company-context-heading">
        <h2
          id="company-context-heading"
          className="text-xl font-semibold text-foreground"
        >
          Company Context
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No company context data available for this report.
        </p>
      </section>
    );
  }

  const crawledPageCount = data.crawledPages?.length ?? 0;

  return (
    <section aria-labelledby="company-context-heading">
      {/* Section header with edit affordance */}
      <div className="flex items-start justify-between gap-4">
        <h2
          id="company-context-heading"
          className="text-xl font-semibold text-foreground"
        >
          Company Context
        </h2>

        <a
          href={`/login?next=/report/${token}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Log in to edit this section"
        >
          <PencilIcon />
          Edit
        </a>
      </div>

      {/* AI-generated description */}
      {data.description && (
        <div className="mt-4 rounded-lg border border-border bg-card p-5">
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
            {data.description}
          </p>
        </div>
      )}

      {/* Product signals */}
      {data.productSignals && data.productSignals.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Product Signals
          </h3>
          <ul className="space-y-1">
            {data.productSignals.map((signal, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {signal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Target audience + competitive angle */}
      {(data.targetAudience || data.competitiveAngle) && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.targetAudience && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Target Audience
              </p>
              <p className="text-sm text-foreground">{data.targetAudience}</p>
            </div>
          )}
          {data.competitiveAngle && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Competitive Angle
              </p>
              <p className="text-sm text-foreground">{data.competitiveAngle}</p>
            </div>
          )}
        </div>
      )}

      {/* Crawled pages footnote */}
      {crawledPageCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Based on {crawledPageCount} page{crawledPageCount !== 1 ? "s" : ""}{" "}
          crawled
        </p>
      )}
    </section>
  );
}

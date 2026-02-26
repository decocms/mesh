/**
 * Diagnostic Report Page — /report/$token
 *
 * Public page (no auth required). Displays a single-card issues-focused report.
 * When token is "mock", renders hardcoded farmrio.com.br data.
 * Otherwise falls back to the API to load a real session.
 */

import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@deco/ui/lib/utils.ts";
import { KEYS } from "@/web/lib/query-keys";
import type { DiagnosticSession } from "@/diagnostic/types";
import { ShareButton } from "@/web/components/report/share-button";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";

// ============================================================================
// Mock data — farmrio.com.br
// ============================================================================

type Severity = "critical" | "warning" | "info";

interface Issue {
  severity: Severity;
  description: string;
  cost: string | null;
}

interface MockReport {
  url: string;
  title: string;
  date: string;
  scores: {
    pageSpeed: number;
    seo: number;
    errors: number;
    conversion: number;
  };
  issues: Issue[];
  revenueAtRisk: string;
}

const MOCK_REPORT: MockReport = {
  url: "farmrio.com.br",
  title: "FarmRio's Storefront Diagnostic",
  date: "February 25, 2026",
  scores: {
    pageSpeed: 62,
    seo: 71,
    errors: 4,
    conversion: 23,
  },
  issues: [
    {
      severity: "critical",
      description:
        "Homepage LCP is 4.7s on mobile \u2014 each second above 2.5s increases bounce rate by ~7%",
      cost: "~$45K/yr",
    },
    {
      severity: "critical",
      description:
        'No images use fetchpriority="high" \u2014 LCP image loads without priority',
      cost: "~$32K/yr",
    },
    {
      severity: "critical",
      description:
        "No WebP or AVIF images detected \u2014 modern formats reduce file sizes by 25-50%",
      cost: "~$28K/yr",
    },
    {
      severity: "warning",
      description: "Meta description missing \u2014 CTR drops ~30% without one",
      cost: "~$18K/yr",
    },
    {
      severity: "warning",
      description:
        "No sitemap.xml detected \u2014 search engines may miss pages",
      cost: "~$12K/yr",
    },
    {
      severity: "info",
      description:
        "164 images found, all use lazy loading \u2014 good practice",
      cost: null,
    },
    {
      severity: "info",
      description: "GA4 and GTM detected \u2014 analytics properly configured",
      cost: null,
    },
  ],
  revenueAtRisk: "$135K/yr",
};

// ============================================================================
// Helpers
// ============================================================================

function getScoreColor(value: number): string {
  if (value >= 80) return "text-success";
  if (value >= 50) return "text-warning";
  return "text-destructive";
}

function getScoreBg(value: number): string {
  if (value >= 80) return "bg-success/10";
  if (value >= 50) return "bg-warning/10";
  return "bg-destructive/10";
}

function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "bg-destructive";
    case "warning":
      return "bg-warning";
    case "info":
      return "bg-blue-500";
  }
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

// ============================================================================
// Score badge
// ============================================================================

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl px-4 py-3",
        getScoreBg(value),
      )}
    >
      <span
        className={cn(
          "font-mono text-2xl font-bold tabular-nums",
          getScoreColor(value),
        )}
      >
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ============================================================================
// Issue row
// ============================================================================

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
      <span
        className={cn(
          "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
          getSeverityColor(issue.severity),
        )}
      />
      <p className="flex-1 text-sm text-foreground leading-relaxed">
        {issue.description}
      </p>
      {issue.cost && (
        <span className="shrink-0 text-sm font-medium text-destructive tabular-nums">
          {issue.cost}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function ReportSkeleton() {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-card border border-border p-8 shadow-lg">
        <div
          className="animate-pulse space-y-6"
          aria-busy="true"
          aria-label="Loading report"
        >
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="flex gap-4">
            <div className="h-16 flex-1 rounded-xl bg-muted" />
            <div className="h-16 flex-1 rounded-xl bg-muted" />
            <div className="h-16 flex-1 rounded-xl bg-muted" />
            <div className="h-16 flex-1 rounded-xl bg-muted" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
            <div className="h-4 w-4/6 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Not found
// ============================================================================

function ReportNotFound({ token }: { token: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">Report Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No diagnostic report found for token{" "}
          <code className="rounded bg-background px-1.5 py-0.5 text-xs font-mono">
            {token}
          </code>
          . Reports expire after 7 days.
        </p>
        <a
          href="/onboarding"
          className="mt-6 inline-flex items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
        >
          Run a new diagnostic
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Mock report card
// ============================================================================

function MockReportCard() {
  const report = MOCK_REPORT;
  const issueCount = report.issues.length;
  const criticalCount = report.issues.filter(
    (i) => i.severity === "critical",
  ).length;

  const session = authClient.useSession();
  const loginUrl = `/login?next=${encodeURIComponent("/onboard-setup?token=mock")}`;

  // Store token for OAuth redirect fallback
  if (typeof window !== "undefined") {
    sessionStorage.setItem(LOCALSTORAGE_KEYS.onboardingToken(), "mock");
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-3xl rounded-2xl bg-card border border-border p-8 shadow-lg">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted shadow-sm border border-border">
              <span className="text-xl font-bold text-foreground">F</span>
            </div>
            <span className="text-sm text-muted-foreground font-mono">
              {report.url}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{report.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyzed on {report.date}
          </p>
        </div>

        {/* Score badges */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
          <ScoreBadge label="PageSpeed" value={report.scores.pageSpeed} />
          <ScoreBadge label="SEO" value={report.scores.seo} />
          <ScoreBadge label="Errors" value={report.scores.errors} />
          <ScoreBadge label="Conversion" value={report.scores.conversion} />
        </div>

        {/* Issues table */}
        <div className="mb-8">
          {/* Table header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
              {issueCount} ISSUES FOUND
            </span>
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-destructive">
              EST. REVENUE AT RISK: {report.revenueAtRisk}
            </span>
          </div>

          {/* Issue rows */}
          <div>
            {report.issues.map((issue, i) => (
              <IssueRow key={i} issue={issue} />
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="border-t border-border pt-6 mb-8">
          <p className="text-lg font-semibold text-foreground">
            <span className="text-destructive">
              {report.revenueAtRisk} at risk.
            </span>{" "}
            Your storefront needs attention.
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            <span>{criticalCount} critical issues</span>
            <span className="text-border">|</span>
            <span>{issueCount} total findings</span>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <ShareButton />
          {!session.data && (
            <a
              href={loginUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              Fix issues with AI
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Free audit runs once per week
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// API-backed report card (for real tokens)
// ============================================================================

function ApiReportCard({ token }: { token: string }) {
  const {
    data: session,
    isLoading,
    isError,
  } = useQuery<DiagnosticSession>({
    queryKey: KEYS.diagnosticSession(token),
    queryFn: () =>
      fetch(`/api/diagnostic/session/${token}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    retry: false,
  });

  if (isLoading) {
    return <ReportSkeleton />;
  }

  if (isError || !session) {
    return <ReportNotFound token={token} />;
  }

  // For real sessions, build issues from the diagnostic results
  const issues = buildIssuesFromSession(session);
  const issueCount = issues.length;
  const criticalCount = issues.filter((i) => i.severity === "critical").length;

  const loginSession = authClient.useSession();
  const loginUrl = `/login?next=${encodeURIComponent(`/onboard-setup?token=${token}`)}`;

  if (typeof window !== "undefined") {
    sessionStorage.setItem(LOCALSTORAGE_KEYS.onboardingToken(), token);
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-3xl rounded-2xl bg-card border border-border p-8 shadow-lg">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted shadow-sm border border-border">
              <span className="text-xl font-bold text-foreground">
                {session.url
                  .replace(/^https?:\/\//, "")
                  .charAt(0)
                  .toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-muted-foreground font-mono break-all">
              {session.url}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Storefront Diagnostic
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyzed on {formatDate(session.createdAt)}
          </p>
        </div>

        {/* Issues table */}
        {issueCount > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <span className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
                {issueCount} ISSUES FOUND
              </span>
            </div>
            <div>
              {issues.map((issue, i) => (
                <IssueRow key={i} issue={issue} />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="border-t border-border pt-6 mb-8">
          <p className="text-lg font-semibold text-foreground">
            {criticalCount > 0
              ? "Your storefront needs attention."
              : "Your storefront looks good!"}
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            <span>{criticalCount} critical issues</span>
            <span className="text-border">|</span>
            <span>{issueCount} total findings</span>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <ShareButton />
          {!loginSession.data && (
            <a
              href={loginUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              Fix issues with AI
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Free audit runs once per week
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Build issues from a real diagnostic session
// ============================================================================

function buildIssuesFromSession(session: DiagnosticSession): Issue[] {
  const issues: Issue[] = [];
  const perf = session.results?.webPerformance;
  const seo = session.results?.seo;

  // Performance issues (use mobile LCP/CLS from PageSpeed Insights)
  if (perf) {
    const lcpValue = perf.mobile?.lcp?.value;
    if (lcpValue && lcpValue > 2500) {
      issues.push({
        severity: lcpValue > 4000 ? "critical" : "warning",
        description: `LCP is ${(lcpValue / 1000).toFixed(1)}s on mobile \u2014 target is under 2.5s`,
        cost: null,
      });
    }
    const clsValue = perf.mobile?.cls?.value;
    if (clsValue && clsValue > 0.1) {
      issues.push({
        severity: clsValue > 0.25 ? "critical" : "warning",
        description: `CLS is ${clsValue.toFixed(2)} \u2014 target is under 0.1`,
        cost: null,
      });
    }
    // Image audit issues
    if (perf.imageAudit?.issues) {
      for (const img of perf.imageAudit.issues) {
        issues.push({
          severity: img.severity,
          description: img.message,
          cost: null,
        });
      }
    }
  }

  // SEO issues
  if (seo) {
    if (!seo.metaDescription) {
      issues.push({
        severity: "warning",
        description:
          "Meta description missing \u2014 CTR drops ~30% without one",
        cost: null,
      });
    }
    if (!seo.hasSitemap) {
      issues.push({
        severity: "warning",
        description:
          "No sitemap.xml detected \u2014 search engines may miss pages",
        cost: null,
      });
    }
  }

  return issues;
}

// ============================================================================
// Report page
// ============================================================================

export default function ReportPage() {
  const { token } = useParams({ from: "/report/$token" });

  if (token === "mock") {
    return <MockReportCard />;
  }

  return <ApiReportCard token={token} />;
}

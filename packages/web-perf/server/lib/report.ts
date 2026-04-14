import type {
  TrackedSite,
  ReportData,
  MetricRating,
  Rating,
  CrUXRecord,
} from "./types.ts";
import {
  CWV_THRESHOLDS,
  rateMetric,
  ratePerformanceScore,
  formatMetricValue,
  passesCWV,
  type MetricName,
} from "./metrics.ts";

function priorityFromSavings(
  savingsMs: number,
): "critical" | "high" | "medium" | "low" {
  if (savingsMs >= 1000) return "critical";
  if (savingsMs >= 500) return "high";
  if (savingsMs >= 100) return "medium";
  return "low";
}

function worstRating(...ratings: Rating[]): Rating {
  if (ratings.includes("poor")) return "poor";
  if (ratings.includes("needs-improvement")) return "needs-improvement";
  return "good";
}

function buildMetricRatings(crux: CrUXRecord): MetricRating[] {
  const result: MetricRating[] = [];
  for (const [key, info] of Object.entries(CWV_THRESHOLDS)) {
    const metric = crux[key as MetricName];
    if (!metric) continue;
    const value = metric.percentiles.p75;
    result.push({
      name: key,
      label: info.label,
      value,
      unit: info.unit,
      rating: rateMetric(key as MetricName, value),
      goodThreshold: info.good,
      poorThreshold: info.poor,
    });
  }
  return result;
}

function describeTrend(site: TrackedSite): string | undefined {
  const history = site.cruxHistory;
  if (!history || !history.record.lcp) return undefined;

  const lines: string[] = [];
  for (const [key, info] of Object.entries(CWV_THRESHOLDS)) {
    const metric = history.record[key as MetricName];
    if (!metric?.percentilesTimeseries?.p75s) continue;
    const values = metric.percentilesTimeseries.p75s;
    if (values.length < 4) continue;

    const recent = values.slice(-4);
    const older = values.slice(-8, -4);
    if (older.length === 0) continue;

    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    let direction: string;
    if (Math.abs(change) < 3) direction = "stable";
    else if (change < 0)
      direction = `improving (${Math.abs(change).toFixed(0)}% better)`;
    else direction = `degrading (${change.toFixed(0)}% worse)`;

    lines.push(`${info.label}: ${direction}`);
  }

  return lines.length > 0 ? lines.join(". ") : undefined;
}

export function generateReport(site: TrackedSite): ReportData {
  const latest = site.snapshots[0];
  if (!latest) {
    return {
      site,
      overallRating: "poor",
      cwvPass: false,
      metrics: [],
      opportunities: [],
      recommendations: [
        "No snapshot data available. Run PERF_SNAPSHOT to collect performance data.",
      ],
    };
  }

  // Prefer phone CrUX data, fall back to all
  const crux = latest.crux?.phone ?? latest.crux?.all;
  const metrics = crux ? buildMetricRatings(crux) : [];

  const lcp = crux?.lcp?.percentiles.p75;
  const inp = crux?.inp?.percentiles.p75;
  const cls = crux?.cls?.percentiles.p75;
  const cwvPass = passesCWV(lcp, inp, cls);

  const performanceScore = latest.pagespeed?.performanceScore;
  const metricRatings = metrics.map((m) => m.rating);
  const scoreRating = performanceScore
    ? ratePerformanceScore(performanceScore)
    : undefined;
  const overallRating = worstRating(
    ...metricRatings,
    ...(scoreRating ? [scoreRating] : []),
  );

  const opportunities = (latest.pagespeed?.opportunities ?? []).map((opp) => {
    const savingsMs = opp.details?.overallSavingsMs ?? 0;
    const savingsBytes = opp.details?.overallSavingsBytes ?? 0;
    const parts: string[] = [];
    if (savingsMs > 0) parts.push(`${Math.round(savingsMs)}ms`);
    if (savingsBytes > 0) parts.push(`${Math.round(savingsBytes / 1024)}KB`);

    return {
      title: opp.title,
      savings: parts.join(" / ") || "—",
      savingsMs: savingsMs > 0 ? savingsMs : undefined,
      savingsBytes: savingsBytes > 0 ? savingsBytes : undefined,
      priority: priorityFromSavings(savingsMs),
      description: opp.description.replace(/\[.*?\]\(.*?\)/g, "").trim(),
    };
  });

  const recommendations: string[] = [];

  // CWV-based recommendations
  if (lcp && rateMetric("lcp", lcp) !== "good") {
    recommendations.push(
      `LCP is ${formatMetricValue("lcp", lcp)} (threshold: 2.5s). Optimize the largest content element: compress images, use next-gen formats (WebP/AVIF), preload critical resources, and reduce server response time.`,
    );
  }
  if (inp && rateMetric("inp", inp) !== "good") {
    recommendations.push(
      `INP is ${formatMetricValue("inp", inp)} (threshold: 200ms). Reduce JavaScript execution time: break up long tasks, defer non-critical scripts, optimize event handlers, and use web workers for heavy computation.`,
    );
  }
  if (cls && rateMetric("cls", cls) !== "good") {
    recommendations.push(
      `CLS is ${formatMetricValue("cls", cls)} (threshold: 0.1). Set explicit dimensions on images/videos, avoid inserting content above existing content, and use CSS containment for dynamic elements.`,
    );
  }

  const trendSummary = describeTrend(site);

  return {
    site,
    overallRating,
    performanceScore,
    cwvPass,
    metrics,
    opportunities,
    recommendations,
    trendSummary,
  };
}

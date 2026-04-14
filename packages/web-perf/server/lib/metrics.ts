import type { Rating } from "./types.ts";

export const CWV_THRESHOLDS = {
  lcp: {
    good: 2500,
    poor: 4000,
    unit: "ms",
    label: "Largest Contentful Paint",
  },
  inp: { good: 200, poor: 500, unit: "ms", label: "Interaction to Next Paint" },
  cls: { good: 0.1, poor: 0.25, unit: "", label: "Cumulative Layout Shift" },
  fcp: { good: 1800, poor: 3000, unit: "ms", label: "First Contentful Paint" },
  ttfb: { good: 800, poor: 1800, unit: "ms", label: "Time to First Byte" },
} as const;

export type MetricName = keyof typeof CWV_THRESHOLDS;

export function rateMetric(name: MetricName, value: number): Rating {
  const t = CWV_THRESHOLDS[name];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

export function ratePerformanceScore(score: number): Rating {
  if (score >= 90) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}

export function formatMetricValue(name: MetricName, value: number): string {
  if (name === "cls") return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

export const RATING_COLORS = {
  good: "#0cce6b",
  "needs-improvement": "#ffa400",
  poor: "#ff4e42",
} as const;

/** Core Web Vitals are LCP, INP, CLS — a site "passes" if all three are good */
export function passesCWV(lcp?: number, inp?: number, cls?: number): boolean {
  if (lcp === undefined || inp === undefined || cls === undefined) return false;
  return (
    rateMetric("lcp", lcp) === "good" &&
    rateMetric("inp", inp) === "good" &&
    rateMetric("cls", cls) === "good"
  );
}

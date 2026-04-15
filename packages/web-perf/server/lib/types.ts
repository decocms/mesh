// ── Site & Config ──

export interface SiteConfig {
  id: string;
  name: string;
  origin: string;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedSite extends SiteConfig {
  snapshots: Snapshot[];
  cruxHistory?: CrUXHistoryData;
}

export interface SiteSummary {
  id: string;
  name: string;
  origin: string;
  snapshotCount: number;
  latestSnapshot?: {
    timestamp: string;
    performanceScore?: number;
    lcp?: number;
    inp?: number;
    cls?: number;
    fcp?: number;
    ttfb?: number;
  };
}

// ── Snapshot ──

export interface Snapshot {
  id: string;
  timestamp: string;
  crux?: CrUXData;
  pagespeed?: PageSpeedData;
}

// ── CrUX Types ──

export interface CrUXHistogramEntry {
  start: number;
  end?: number;
  density: number;
}

export interface CrUXMetric {
  histogram: CrUXHistogramEntry[];
  percentiles: { p75: number };
}

export interface CrUXRecord {
  lcp?: CrUXMetric;
  inp?: CrUXMetric;
  cls?: CrUXMetric;
  fcp?: CrUXMetric;
  ttfb?: CrUXMetric;
}

export interface CrUXData {
  phone?: CrUXRecord;
  desktop?: CrUXRecord;
  all?: CrUXRecord;
  collectionPeriod: {
    firstDate: string;
    lastDate: string;
  };
}

// ── CrUX History ──

export interface CrUXHistoryMetric {
  histogramTimeseries: Array<{
    start: number;
    end?: number;
    densities: number[];
  }>;
  percentilesTimeseries: {
    p75s: number[];
  };
}

export interface CrUXHistoryRecord {
  lcp?: CrUXHistoryMetric;
  inp?: CrUXHistoryMetric;
  cls?: CrUXHistoryMetric;
  fcp?: CrUXHistoryMetric;
  ttfb?: CrUXHistoryMetric;
}

export interface CrUXHistoryData {
  record: CrUXHistoryRecord;
  collectionPeriods: Array<{
    firstDate: string;
    lastDate: string;
  }>;
  fetchedAt: string;
}

// ── PageSpeed Types ──

export interface PageSpeedAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  details?: {
    type: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: Array<Record<string, unknown>>;
  };
}

export interface PageSpeedData {
  performanceScore: number;
  metrics: {
    fcp: number;
    lcp: number;
    cls: number;
    inp: number;
    ttfb: number;
    si: number;
    tbt: number;
  };
  opportunities: PageSpeedAudit[];
  diagnostics: PageSpeedAudit[];
  strategy: "mobile" | "desktop";
  fetchedAt: string;
}

// ── Report Types ──

export type Rating = "good" | "needs-improvement" | "poor";

export interface MetricRating {
  name: string;
  label: string;
  value: number;
  unit: string;
  rating: Rating;
  goodThreshold: number;
  poorThreshold: number;
}

export interface ReportData {
  site: SiteConfig;
  overallRating: Rating;
  performanceScore?: number;
  cwvPass: boolean;
  metrics: MetricRating[];
  opportunities: Array<{
    title: string;
    savings: string;
    savingsMs?: number;
    savingsBytes?: number;
    priority: "critical" | "high" | "medium" | "low";
    description: string;
  }>;
  recommendations: string[];
  trendSummary?: string;
}

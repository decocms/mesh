import type { PageSpeedData, PageSpeedAudit } from "./types.ts";

const PSI_API =
  "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

function extractAudit(
  audits: Record<string, unknown>,
  id: string,
): PageSpeedAudit | null {
  const a = audits[id] as
    | {
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
    | undefined;
  if (!a) return null;
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    score: a.score,
    displayValue: a.displayValue,
    numericValue: a.numericValue,
    numericUnit: a.numericUnit,
    details: a.details,
  };
}

function getNumericValue(audits: Record<string, unknown>, id: string): number {
  const a = audits[id] as { numericValue?: number } | undefined;
  return a?.numericValue ?? 0;
}

export async function fetchPageSpeed(
  url: string,
  apiKey: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<PageSpeedData> {
  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy,
    category: "performance",
  });

  const res = await fetch(`${PSI_API}?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PageSpeed API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    lighthouseResult: {
      categories: {
        performance: { score: number };
      };
      audits: Record<string, unknown>;
    };
  };

  const { audits, categories } = data.lighthouseResult;
  const performanceScore = Math.round(
    (categories.performance.score ?? 0) * 100,
  );

  const metrics = {
    fcp: getNumericValue(audits, "first-contentful-paint"),
    lcp: getNumericValue(audits, "largest-contentful-paint"),
    cls: getNumericValue(audits, "cumulative-layout-shift"),
    inp: getNumericValue(audits, "interaction-to-next-paint"),
    ttfb: getNumericValue(audits, "server-response-time"),
    si: getNumericValue(audits, "speed-index"),
    tbt: getNumericValue(audits, "total-blocking-time"),
  };

  // Split audits into opportunities (have savings) and diagnostics
  const opportunities: PageSpeedAudit[] = [];
  const diagnostics: PageSpeedAudit[] = [];

  for (const key of Object.keys(audits)) {
    const audit = extractAudit(audits, key);
    if (!audit) continue;

    const savings = audit.details?.overallSavingsMs ?? 0;
    const bytesSavings = audit.details?.overallSavingsBytes ?? 0;

    if (savings > 0 || bytesSavings > 0) {
      opportunities.push(audit);
    } else if (
      audit.score !== null &&
      audit.score < 1 &&
      audit.details?.type === "table"
    ) {
      diagnostics.push(audit);
    }
  }

  // Sort opportunities by potential time savings descending
  opportunities.sort(
    (a, b) =>
      (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0),
  );

  return {
    performanceScore,
    metrics,
    opportunities,
    diagnostics,
    strategy,
    fetchedAt: new Date().toISOString(),
  };
}

import type {
  CrUXRecord,
  CrUXData,
  CrUXMetric,
  CrUXHistoryData,
  CrUXHistoryRecord,
  CrUXHistoryMetric,
} from "./types.ts";

const CRUX_API_BASE = "https://chromeuxreport.googleapis.com/v1/records";

type FormFactor = "PHONE" | "DESKTOP" | "ALL_FORM_FACTORS";

/** Maps CrUX API metric keys to our short names */
const METRIC_MAP: Record<string, keyof CrUXRecord> = {
  largest_contentful_paint: "lcp",
  interaction_to_next_paint: "inp",
  cumulative_layout_shift: "cls",
  first_contentful_paint: "fcp",
  experimental_time_to_first_byte: "ttfb",
};

function toNumber(v: unknown): number {
  return typeof v === "string" ? Number.parseFloat(v) : (v as number);
}

function mapMetrics(apiMetrics: Record<string, unknown>): CrUXRecord {
  const record: CrUXRecord = {};
  for (const [apiKey, shortKey] of Object.entries(METRIC_MAP)) {
    const m = apiMetrics[apiKey] as
      | {
          histogram: Array<{
            start: unknown;
            end?: unknown;
            density: unknown;
          }>;
          percentiles: { p75: unknown };
        }
      | undefined;
    if (m) {
      // Ensure all values are numbers (CLS comes as strings from the API)
      record[shortKey] = {
        histogram: m.histogram.map((h) => ({
          start: toNumber(h.start),
          end: h.end !== undefined ? toNumber(h.end) : undefined,
          density: toNumber(h.density),
        })),
        percentiles: { p75: toNumber(m.percentiles.p75) },
      };
    }
  }
  return record;
}

function mapHistoryMetrics(
  apiMetrics: Record<string, unknown>,
): CrUXHistoryRecord {
  const record: CrUXHistoryRecord = {};
  for (const [apiKey, shortKey] of Object.entries(METRIC_MAP)) {
    const m = apiMetrics[apiKey] as CrUXHistoryMetric | undefined;
    if (m) {
      (record as Record<string, CrUXHistoryMetric>)[shortKey] = m;
    }
  }
  return record;
}

function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export async function fetchCrUXRecord(
  origin: string,
  apiKey: string,
  formFactor?: FormFactor,
): Promise<CrUXRecord | null> {
  const body: Record<string, string> = { origin };
  if (formFactor && formFactor !== "ALL_FORM_FACTORS") {
    body.formFactor = formFactor;
  }

  const res = await fetch(`${CRUX_API_BASE}:queryRecord?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CrUX API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    record: {
      metrics: Record<string, unknown>;
      collectionPeriod?: {
        firstDate: { year: number; month: number; day: number };
        lastDate: { year: number; month: number; day: number };
      };
    };
  };
  const record = mapMetrics(data.record.metrics);
  // Attach raw collection period for extraction by fetchCrUXData
  if (data.record.collectionPeriod) {
    (record as Record<string, unknown>)._collectionPeriod =
      data.record.collectionPeriod;
  }
  return record;
}

export async function fetchCrUXData(
  origin: string,
  apiKey: string,
): Promise<CrUXData> {
  const [phone, desktop, all] = await Promise.all([
    fetchCrUXRecord(origin, apiKey, "PHONE"),
    fetchCrUXRecord(origin, apiKey, "DESKTOP"),
    fetchCrUXRecord(origin, apiKey),
  ]);

  // Extract collection period from the first successful response
  let collectionPeriod = { firstDate: "", lastDate: "" };
  const firstRecord = (all ?? phone ?? desktop) as
    | (CrUXRecord & {
        _collectionPeriod?: {
          firstDate: { year: number; month: number; day: number };
          lastDate: { year: number; month: number; day: number };
        };
      })
    | null;
  if (firstRecord?._collectionPeriod) {
    const cp = firstRecord._collectionPeriod;
    collectionPeriod = {
      firstDate: formatDate(cp.firstDate),
      lastDate: formatDate(cp.lastDate),
    };
    delete (firstRecord as Record<string, unknown>)._collectionPeriod;
  }
  // Clean up _collectionPeriod from all records
  for (const r of [phone, desktop, all]) {
    if (r) delete (r as Record<string, unknown>)._collectionPeriod;
  }

  return {
    phone: phone ?? undefined,
    desktop: desktop ?? undefined,
    all: all ?? undefined,
    collectionPeriod,
  };
}

export async function fetchCrUXHistory(
  origin: string,
  apiKey: string,
  formFactor?: FormFactor,
): Promise<CrUXHistoryData> {
  const body: Record<string, string> = { origin };
  if (formFactor && formFactor !== "ALL_FORM_FACTORS") {
    body.formFactor = formFactor;
  }

  const res = await fetch(`${CRUX_API_BASE}:queryHistoryRecord?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CrUX History API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    record: {
      metrics: Record<string, unknown>;
      collectionPeriods: Array<{
        firstDate: { year: number; month: number; day: number };
        lastDate: { year: number; month: number; day: number };
      }>;
    };
  };

  return {
    record: mapHistoryMetrics(data.record.metrics),
    collectionPeriods: data.record.collectionPeriods.map((cp) => ({
      firstDate: formatDate(cp.firstDate),
      lastDate: formatDate(cp.lastDate),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

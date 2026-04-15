import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadSite, saveSite } from "../lib/storage.ts";
import { fetchCrUXData } from "../lib/crux.ts";
import { fetchPageSpeed } from "../lib/pagespeed.ts";
import { rateMetric, formatMetricValue, passesCWV } from "../lib/metrics.ts";
import type { Snapshot } from "../lib/types.ts";

const MAX_SNAPSHOTS = 50;

export const PERF_SNAPSHOT = createTool({
  id: "PERF_SNAPSHOT",
  description:
    "Collect a performance snapshot for a tracked site. Fetches real-user data from Chrome UX Report (CrUX) and runs a Lighthouse lab test via PageSpeed Insights API. Requires a Google API key.",
  annotations: {
    title: "Take Snapshot",
    openWorldHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://web-perf/site-detail" },
  },
  inputSchema: z.object({
    siteId: z.string().describe("The site ID to snapshot"),
    apiKey: z
      .string()
      .optional()
      .describe("Google API key (overrides site-level key)"),
    strategy: z
      .enum(["mobile", "desktop"])
      .optional()
      .default("mobile")
      .describe("PageSpeed test strategy"),
  }),
  execute: async ({ context }) => {
    const site = await loadSite(context.siteId);
    if (!site) throw new Error(`Site not found: ${context.siteId}`);

    const apiKey = context.apiKey ?? site.apiKey ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "No API key provided. Pass apiKey as a parameter, configure it on the site, or set GOOGLE_API_KEY env var.",
      );
    }

    // Fetch CrUX and PageSpeed in parallel
    const [crux, pagespeed] = await Promise.all([
      fetchCrUXData(site.origin, apiKey).catch((e) => {
        console.error("CrUX fetch failed:", e);
        return undefined;
      }),
      fetchPageSpeed(site.origin, apiKey, context.strategy).catch((e) => {
        console.error("PageSpeed fetch failed:", e);
        return undefined;
      }),
    ]);

    const snapshot: Snapshot = {
      id: crypto.randomUUID().slice(0, 8),
      timestamp: new Date().toISOString(),
      crux,
      pagespeed,
    };

    // Prepend snapshot, cap at MAX_SNAPSHOTS
    site.snapshots.unshift(snapshot);
    if (site.snapshots.length > MAX_SNAPSHOTS) {
      site.snapshots = site.snapshots.slice(0, MAX_SNAPSHOTS);
    }
    site.updatedAt = new Date().toISOString();
    await saveSite(site);

    // Build summary
    const cruxRecord = crux?.phone ?? crux?.all;
    const lcp = cruxRecord?.lcp?.percentiles.p75;
    const inp = cruxRecord?.inp?.percentiles.p75;
    const cls = cruxRecord?.cls?.percentiles.p75;

    const summaryParts: string[] = [];
    if (pagespeed) {
      summaryParts.push(`Performance score: ${pagespeed.performanceScore}/100`);
    }
    if (lcp !== undefined)
      summaryParts.push(
        `LCP: ${formatMetricValue("lcp", lcp)} (${rateMetric("lcp", lcp)})`,
      );
    if (inp !== undefined)
      summaryParts.push(
        `INP: ${formatMetricValue("inp", inp)} (${rateMetric("inp", inp)})`,
      );
    if (cls !== undefined)
      summaryParts.push(
        `CLS: ${formatMetricValue("cls", cls)} (${rateMetric("cls", cls)})`,
      );
    if (lcp !== undefined && inp !== undefined && cls !== undefined) {
      summaryParts.push(
        `Core Web Vitals: ${passesCWV(lcp, inp, cls) ? "PASSED" : "FAILED"}`,
      );
    }

    if (!crux && !pagespeed) {
      summaryParts.push(
        "Warning: Both CrUX and PageSpeed requests failed. Check your API key and that the site has sufficient traffic for CrUX data.",
      );
    } else if (!crux) {
      summaryParts.push(
        "Note: CrUX data unavailable (site may not have enough traffic for field data). Lab data only.",
      );
    }

    return {
      snapshot,
      site: { id: site.id, name: site.name, origin: site.origin },
      summary: summaryParts.join(". "),
    };
  },
});

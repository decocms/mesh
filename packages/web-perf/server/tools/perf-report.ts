import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadSite } from "../lib/storage.ts";
import { generateReport } from "../lib/report.ts";

export const PERF_REPORT = createTool({
  id: "PERF_REPORT",
  description:
    "Generate a structured performance report for a tracked site with Core Web Vitals ratings, PageSpeed opportunities, and actionable recommendations. Uses the latest snapshot data.",
  annotations: {
    title: "Performance Report",
    readOnlyHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://web-perf/site-detail" },
  },
  inputSchema: z.object({
    siteId: z.string().describe("The site ID to generate a report for"),
  }),
  execute: async ({ context }) => {
    const site = await loadSite(context.siteId);
    if (!site) throw new Error(`Site not found: ${context.siteId}`);

    const report = generateReport(site);
    return { report };
  },
});

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadSite, saveSite } from "../lib/storage.ts";
import { fetchCrUXHistory } from "../lib/crux.ts";

export const CRUX_HISTORY = createTool({
  id: "CRUX_HISTORY",
  description:
    "Fetch Chrome UX Report historical data for a tracked site (25 weekly data points). Used for trend analysis and sparkline charts. Requires a Google API key.",
  annotations: {
    title: "CrUX History",
    openWorldHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://web-perf/site-detail" },
  },
  inputSchema: z.object({
    siteId: z.string().describe("The site ID"),
    apiKey: z
      .string()
      .optional()
      .describe("Google API key (overrides site-level key)"),
    formFactor: z
      .enum(["PHONE", "DESKTOP", "ALL_FORM_FACTORS"])
      .optional()
      .default("PHONE")
      .describe("Device type for CrUX data"),
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

    const history = await fetchCrUXHistory(
      site.origin,
      apiKey,
      context.formFactor,
    );

    site.cruxHistory = history;
    site.updatedAt = new Date().toISOString();
    await saveSite(site);

    const dataPoints = history.collectionPeriods.length;
    return {
      history,
      site: { id: site.id, name: site.name, origin: site.origin },
      message: `Fetched ${dataPoints} weeks of CrUX history data for ${site.origin}.`,
    };
  },
});

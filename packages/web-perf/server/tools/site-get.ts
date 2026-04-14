import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadSite } from "../lib/storage.ts";

export const SITE_GET = createTool({
  id: "SITE_GET",
  description:
    "Get full details for a tracked site including all snapshots and CrUX history data.",
  annotations: {
    title: "Get Site",
    readOnlyHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://web-perf/site-detail" },
  },
  inputSchema: z.object({
    siteId: z.string().describe("The site ID to retrieve"),
  }),
  execute: async ({ context }) => {
    const site = await loadSite(context.siteId);
    if (!site) {
      throw new Error(`Site not found: ${context.siteId}`);
    }
    return { site };
  },
});

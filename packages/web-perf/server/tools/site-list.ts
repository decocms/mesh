import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { listSiteSummaries } from "../lib/storage.ts";

export const SITE_LIST = createTool({
  id: "SITE_LIST",
  description:
    "List all tracked websites with their latest performance scores and Core Web Vitals.",
  annotations: {
    title: "List Sites",
    readOnlyHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://web-perf/dashboard" },
  },
  inputSchema: z.object({}),
  execute: async () => {
    const sites = await listSiteSummaries();
    return {
      sites,
      count: sites.length,
      message:
        sites.length === 0
          ? "No sites tracked yet. Use SITE_ADD to start monitoring a website."
          : `${sites.length} site${sites.length > 1 ? "s" : ""} tracked.`,
    };
  },
});

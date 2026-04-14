import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { saveSite } from "../lib/storage.ts";
import type { TrackedSite } from "../lib/types.ts";

export const SITE_ADD = createTool({
  id: "SITE_ADD",
  description:
    "Add a website to track for performance monitoring. Specify the origin URL (e.g., https://example.com) and an optional Google API key.",
  annotations: {
    title: "Add Site",
  },
  _meta: {
    ui: { resourceUri: "ui://web-perf/dashboard" },
  },
  inputSchema: z.object({
    name: z.string().describe("Friendly name for the site"),
    origin: z
      .string()
      .describe("Origin URL to track (e.g., https://example.com)"),
    apiKey: z
      .string()
      .optional()
      .describe("Google API key for CrUX and PageSpeed APIs"),
  }),
  execute: async ({ context }) => {
    // Normalize origin: remove trailing slash
    const origin = context.origin.replace(/\/+$/, "");

    try {
      new URL(origin);
    } catch {
      throw new Error(`Invalid URL: ${origin}`);
    }

    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();

    const site: TrackedSite = {
      id,
      name: context.name,
      origin,
      apiKey: context.apiKey,
      snapshots: [],
      createdAt: now,
      updatedAt: now,
    };

    await saveSite(site);

    return {
      id: site.id,
      name: site.name,
      origin: site.origin,
      createdAt: site.createdAt,
      message: `Site "${site.name}" (${site.origin}) added. Use PERF_SNAPSHOT to collect performance data.`,
    };
  },
});

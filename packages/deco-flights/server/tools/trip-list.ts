import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { listFullTrips } from "../lib/storage.ts";
import { isWorkerRunning } from "../lib/worker.ts";

export const TRIP_LIST = createTool({
  id: "TRIP_LIST",
  description:
    "List all saved trips with search tasks and top results (capped at 10 per trip).",
  annotations: {
    title: "List Trips",
    readOnlyHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://deco-flights/trips-dashboard" },
  },
  inputSchema: z.object({
    status: z
      .enum(["draft", "researching", "complete", "all"])
      .optional()
      .default("all")
      .describe("Filter by trip status"),
  }),
  execute: async ({ context }) => {
    const trips = await listFullTrips(context.status);
    const trimmed = trips.map((t) => ({
      ...t,
      results: (t.results ?? []).slice(0, 20),
      _totalResults: t.results?.length ?? 0,
      workerRunning: isWorkerRunning(t.id),
    }));
    return { trips: trimmed, totalCount: trips.length };
  },
});

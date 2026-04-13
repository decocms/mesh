import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadTrip } from "../lib/storage.ts";
import { isWorkerRunning } from "../lib/worker.ts";

export const TRIP_GET = createTool({
  id: "TRIP_GET",
  description:
    "Get trip details including search tasks progress and top results. " +
    "Returns at most 20 results to keep response size manageable.",
  annotations: {
    title: "Get Trip",
    readOnlyHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://deco-flights/trip-planner" },
  },
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID"),
  }),
  execute: async ({ context }) => {
    const trip = await loadTrip(context.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${context.tripId}`);
    }

    // Return a trimmed trip: full searchTasks but capped results
    const totalResults = trip.results?.length ?? 0;
    const trimmedTrip = {
      ...trip,
      results: (trip.results ?? []).slice(0, 20),
      _totalResults: totalResults,
    };

    return {
      trip: trimmedTrip,
      workerRunning: isWorkerRunning(context.tripId),
    };
  },
});

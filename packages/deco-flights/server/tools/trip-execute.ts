import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadTrip } from "../lib/storage.ts";
import { isWorkerRunning, startWorker } from "../lib/worker.ts";

export const TRIP_EXECUTE = createTool({
  id: "TRIP_EXECUTE",
  description:
    "Start flight research for a trip. Launches a background worker that runs ALL searches automatically. " +
    "Returns immediately with the trip data and a live UI dashboard. Use TRIP_STOP to cancel.",
  annotations: {
    title: "Execute Trip Research",
  },
  _meta: {
    ui: { resourceUri: "ui://deco-flights/trip-planner" },
  },
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to research"),
  }),
  execute: async ({ context }) => {
    const trip = await loadTrip(context.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${context.tripId}`);
    }

    const alreadyRunning = isWorkerRunning(context.tripId);

    if (!alreadyRunning) {
      startWorker(context.tripId);
    }

    // Re-read trip after worker may have initialized tasks
    const freshTrip = (await loadTrip(context.tripId)) ?? trip;

    const tasks = freshTrip.searchTasks ?? [];
    const done = tasks.filter(
      (t) => t.status === "done" || t.status === "error",
    ).length;
    const totalSearches =
      tasks.length || freshTrip.searchPlan?.searches.length || 0;

    const trimmedTrip = {
      ...freshTrip,
      results: (freshTrip.results ?? []).slice(0, 20),
      _totalResults: freshTrip.results?.length ?? 0,
    };

    return {
      trip: trimmedTrip,
      workerRunning: true,
      started: !alreadyRunning,
      message: alreadyRunning
        ? `Research running (${done}/${totalSearches} done). Dashboard is live.`
        : `Research started! ${totalSearches} searches running in background.`,
    };
  },
});

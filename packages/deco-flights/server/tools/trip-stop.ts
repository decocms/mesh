import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadTrip, saveTrip } from "../lib/storage.ts";
import { stopWorker } from "../lib/worker.ts";

export const TRIP_STOP = createTool({
  id: "TRIP_STOP",
  description:
    "Stop an in-progress trip research. The background worker will finish its current search then stop. All results found so far are kept.",
  annotations: {
    title: "Stop Research",
  },
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to stop researching"),
  }),
  execute: async ({ context }) => {
    const trip = await loadTrip(context.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${context.tripId}`);
    }

    const wasRunning = stopWorker(context.tripId);

    // Reset running tasks
    for (const task of trip.searchTasks ?? []) {
      if (task.status === "running") {
        task.status = "pending";
        task.startedAt = undefined;
        task.error = undefined;
      }
    }

    trip.status = "draft";
    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);

    const done = (trip.searchTasks ?? []).filter(
      (t) => t.status === "done",
    ).length;
    const pending = (trip.searchTasks ?? []).filter(
      (t) => t.status === "pending",
    ).length;

    return {
      success: true,
      wasRunning,
      resultsKept: trip.results?.length ?? 0,
      done,
      pending,
      message: `Stopped "${trip.name}". ${trip.results?.length ?? 0} results kept, ${done} searches done, ${pending} remaining.`,
    };
  },
});

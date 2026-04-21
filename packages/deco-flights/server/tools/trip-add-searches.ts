import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadTrip, saveTrip } from "../lib/storage.ts";
import { specKey } from "../lib/planner.ts";
import { startWorker, isWorkerRunning } from "../lib/worker.ts";
import type { SearchTask } from "../lib/types.ts";

export const TRIP_ADD_SEARCHES = createTool({
  id: "TRIP_ADD_SEARCHES",
  description:
    "Add more searches to an existing trip and start executing them. Use this to drill down around good dates, try different routes, or refine results. Duplicates are skipped.",
  annotations: {
    title: "Add Searches to Trip",
  },
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to add searches to"),
    searches: z
      .array(
        z.object({
          from: z.string().describe("Departure airport IATA code"),
          to: z.string().describe("Arrival airport IATA code"),
          departDate: z.string().describe("Departure date YYYY-MM-DD"),
          returnDate: z.string().describe("Return date YYYY-MM-DD"),
          returnFrom: z
            .string()
            .optional()
            .describe("Return from different airport (open-jaw)"),
        }),
      )
      .describe("New searches to add"),
    execute: z
      .boolean()
      .optional()
      .default(true)
      .describe("Start executing immediately (default true)"),
  }),
  execute: async ({ context }) => {
    const trip = await loadTrip(context.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${context.tripId}`);
    }

    if (!trip.searchTasks) trip.searchTasks = [];

    // Build set of existing spec keys for dedup
    const existing = new Set(trip.searchTasks.map((t) => specKey(t.spec)));

    const startId = trip.searchTasks.length;
    let added = 0;
    let skipped = 0;

    for (const s of context.searches) {
      const spec = {
        from: s.from.toUpperCase(),
        to: s.to.toUpperCase(),
        departDate: s.departDate,
        returnDate: s.returnDate,
        returnFrom: s.returnFrom?.toUpperCase(),
      };

      const key = specKey(spec);
      if (existing.has(key)) {
        skipped++;
        continue;
      }
      existing.add(key);

      const task: SearchTask = {
        id: startId + added,
        spec,
        status: "pending",
        resultCount: 0,
      };
      trip.searchTasks.push(task);
      added++;
    }

    // Update search plan to reflect new total
    if (trip.searchPlan) {
      trip.searchPlan.searches = trip.searchTasks.map((t) => t.spec);
      trip.searchPlan.totalCombinations = trip.searchTasks.length;
    }

    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);

    // Start worker if requested and not already running
    if (context.execute && added > 0 && !isWorkerRunning(context.tripId)) {
      startWorker(context.tripId);
    }

    return {
      added,
      skipped,
      totalSearches: trip.searchTasks.length,
      workerRunning: isWorkerRunning(context.tripId),
      message:
        added > 0
          ? `Added ${added} searches${skipped ? ` (${skipped} duplicates skipped)` : ""}. ${context.execute ? "Research started." : "Ready to execute."}`
          : `All ${skipped} searches already exist in this trip.`,
    };
  },
});

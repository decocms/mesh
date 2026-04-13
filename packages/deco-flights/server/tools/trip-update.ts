import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadTrip, saveTrip } from "../lib/storage.ts";
import { generateSearchPlan } from "../lib/planner.ts";

export const TRIP_UPDATE = createTool({
  id: "TRIP_UPDATE",
  description:
    "Update a trip's configuration or preferences. Regenerates the search plan if date/destination fields change.",
  annotations: {
    title: "Update Trip",
  },
  inputSchema: z.object({
    tripId: z.string().describe("The trip ID to update"),
    name: z.string().optional(),
    origin: z.string().optional(),
    destinations: z.array(z.string()).optional(),
    earliestDeparture: z.string().optional(),
    latestDeparture: z.string().optional(),
    earliestReturn: z.string().optional(),
    latestReturn: z.string().optional(),
    tripLengthDays: z
      .object({
        min: z.number(),
        max: z.number(),
      })
      .optional(),
    passengers: z.number().optional(),
    seatClass: z
      .enum(["economy", "premium-economy", "business", "first"])
      .optional(),
    preferences: z
      .object({
        maxStops: z.number().optional(),
        maxLayoverHours: z.number().optional(),
        preferredAirports: z.array(z.string()).optional(),
        avoidAirlines: z.array(z.string()).optional(),
        preferredAirlines: z.array(z.string()).optional(),
        maxPrice: z.number().optional(),
        currency: z
          .string()
          .optional()
          .describe("Currency code (e.g. USD, BRL, EUR)"),
      })
      .optional(),
  }),
  execute: async ({ context }) => {
    const trip = await loadTrip(context.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${context.tripId}`);
    }

    const { tripId: _, ...updates } = context;
    let planChanged = false;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        (trip as unknown as Record<string, unknown>)[key] =
          key === "origin"
            ? (value as string).toUpperCase()
            : key === "destinations"
              ? (value as string[]).map((d) => d.toUpperCase())
              : value;

        if (
          [
            "origin",
            "destinations",
            "earliestDeparture",
            "latestDeparture",
            "earliestReturn",
            "latestReturn",
            "tripLengthDays",
          ].includes(key)
        ) {
          planChanged = true;
        }
      }
    }

    if (planChanged) {
      trip.searchPlan = generateSearchPlan(trip);
      trip.results = undefined;
      trip.status = "draft";
    }

    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);

    return {
      trip,
      message: planChanged
        ? `Trip updated. New search plan: ${trip.searchPlan!.searches.length} searches.`
        : "Trip preferences updated.",
    };
  },
});

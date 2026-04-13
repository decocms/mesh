import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { saveTrip } from "../lib/storage.ts";
import { generateSearchPlan } from "../lib/planner.ts";
import type { Trip } from "../lib/types.ts";

export const TRIP_CREATE = createTool({
  id: "TRIP_CREATE",
  description:
    "Create a new trip research plan. Specify destinations, date ranges, trip length, and preferences. The system generates a search plan covering all valid date combinations.",
  annotations: {
    title: "Create Trip",
  },
  _meta: {
    ui: { resourceUri: "ui://deco-flights/trip-card" },
  },
  inputSchema: z.object({
    name: z.string().describe('Trip name (e.g., "Trip to California")'),
    origin: z.string().describe("Departure airport IATA code"),
    destinations: z
      .array(z.string())
      .describe("Destination airport IATA codes"),
    returnOrigins: z
      .array(z.string())
      .optional()
      .describe(
        "Return departure airports for open-jaw itineraries (e.g., fly into LAX, return from SFO). Omit for standard round-trips.",
      ),
    earliestDeparture: z
      .string()
      .describe("Earliest acceptable departure date (YYYY-MM-DD)"),
    latestDeparture: z
      .string()
      .describe("Latest acceptable departure date (YYYY-MM-DD)"),
    earliestReturn: z
      .string()
      .describe("Earliest acceptable return date (YYYY-MM-DD)"),
    latestReturn: z
      .string()
      .describe("Latest acceptable return date (YYYY-MM-DD)"),
    tripLengthDays: z.object({
      min: z.number().describe("Minimum trip length in days"),
      max: z.number().describe("Maximum trip length in days"),
    }),
    passengers: z.number().optional().default(1),
    seatClass: z
      .enum(["economy", "premium-economy", "business", "first"])
      .optional()
      .default("economy"),
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
          .describe("Currency code for prices (default USD)"),
      })
      .optional()
      .default({}),
  }),
  execute: async ({ context }) => {
    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();

    const trip: Trip = {
      id,
      name: context.name,
      status: "draft",
      origin: context.origin.toUpperCase(),
      destinations: context.destinations.map((d) => d.toUpperCase()),
      returnOrigins: context.returnOrigins?.map((d) => d.toUpperCase()),
      earliestDeparture: context.earliestDeparture,
      latestDeparture: context.latestDeparture,
      earliestReturn: context.earliestReturn,
      latestReturn: context.latestReturn,
      tripLengthDays: context.tripLengthDays,
      passengers: context.passengers,
      seatClass: context.seatClass,
      preferences: context.preferences,
      createdAt: now,
      updatedAt: now,
    };

    trip.searchPlan = generateSearchPlan(trip);
    await saveTrip(trip);

    return {
      trip,
      message: `Trip "${trip.name}" created with ${trip.searchPlan.searches.length} planned searches${trip.searchPlan.capped ? ` (capped from ${trip.searchPlan.totalCombinations} total combinations)` : ""}.`,
    };
  },
});

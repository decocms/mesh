import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { searchFlights } from "../lib/scraper.ts";

export const FLIGHT_SEARCH = createTool({
  id: "FLIGHT_SEARCH",
  description:
    "Search for flights between two airports on a specific date. Returns flight options with prices, airlines, stops, and durations.",
  annotations: {
    title: "Search Flights",
    readOnlyHint: true,
  },
  _meta: {
    ui: { resourceUri: "ui://deco-flights/search-results" },
  },
  inputSchema: z.object({
    from: z.string().describe("Departure airport IATA code (e.g., SFO)"),
    to: z.string().describe("Arrival airport IATA code (e.g., LAX)"),
    date: z.string().describe("Departure date in YYYY-MM-DD format"),
    returnDate: z
      .string()
      .optional()
      .describe("Return date in YYYY-MM-DD format (for round trips)"),
    returnFrom: z
      .string()
      .optional()
      .describe(
        "Return departure airport if different from arrival (open-jaw). E.g., fly into LAX, return from SFO.",
      ),
    passengers: z
      .number()
      .optional()
      .default(1)
      .describe("Number of adult passengers"),
    seatClass: z
      .enum(["economy", "premium-economy", "business", "first"])
      .optional()
      .default("economy")
      .describe("Seat class"),
    maxStops: z
      .number()
      .optional()
      .describe("Maximum number of stops (0 for nonstop)"),
    airlines: z
      .array(z.string())
      .optional()
      .describe(
        "Only show flights from these airlines (IATA codes, e.g. ['DL', 'AA', 'UA'])",
      ),
    currency: z.string().optional().default("USD").describe("Currency code"),
  }),
  execute: async ({ context }) => {
    const returnFrom = context.returnFrom?.toUpperCase();
    const searchSpec = {
      from: context.from.toUpperCase(),
      to: context.to.toUpperCase(),
      departDate: context.date,
      returnDate: context.returnDate ?? context.date,
      returnFrom,
    };

    const response = await searchFlights(
      {
        from: searchSpec.from,
        to: searchSpec.to,
        date: context.date,
        returnDate: context.returnDate,
        returnFrom,
        passengers: context.passengers,
        seatClass: context.seatClass,
        maxStops: context.maxStops,
        airlines: context.airlines,
        currency: context.currency,
      },
      searchSpec,
    );

    return {
      results: response.results,
      resultCount: response.results.length,
      googleFlightsUrl: response.googleFlightsUrl,
      error: response.error,
    };
  },
});

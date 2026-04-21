import {
  createQuery,
  getFlights,
  Passengers,
  CaptchaError,
  HttpError,
  TimeoutError,
  ParseError,
  type FlightQueryInput,
  type SeatType,
} from "fast-flights-ts";
import type { FlightResult, SearchSpec } from "./types.ts";

export interface SearchOptions {
  from: string;
  to: string;
  date: string;
  returnDate?: string;
  returnFrom?: string;
  passengers?: number;
  seatClass?: string;
  maxStops?: number;
  airlines?: string[];
  currency?: string;
}

export interface SearchResponse {
  results: FlightResult[];
  googleFlightsUrl: string;
  error?: string;
}

function formatDt(dt: {
  date: readonly [number, number, number];
  time: readonly [number, number];
}): string {
  const [y, m, d] = dt.date;
  const [h, min] = dt.time;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export async function searchFlights(
  opts: SearchOptions,
  searchSpec: SearchSpec,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  try {
    const flights: FlightQueryInput[] = [
      {
        date: opts.date,
        from_airport: opts.from,
        to_airport: opts.to,
        max_stops: opts.maxStops,
        airlines: opts.airlines,
      },
    ];

    const returnOrigin = opts.returnFrom || opts.to;
    const isOpenJaw = opts.returnDate && returnOrigin !== opts.to;

    if (opts.returnDate) {
      flights.push({
        date: opts.returnDate,
        from_airport: returnOrigin,
        to_airport: opts.from,
        max_stops: opts.maxStops,
        airlines: opts.airlines,
      });
    }

    const tripType = isOpenJaw
      ? "multi-city"
      : opts.returnDate
        ? "round-trip"
        : "one-way";

    const query = createQuery({
      flights,
      seat: (opts.seatClass as SeatType) || "economy",
      trip: tripType,
      passengers: new Passengers({ adults: opts.passengers || 1 }),
      currency: opts.currency || "USD",
      language: "en-US",
    });

    const googleFlightsUrl = query.url();

    const rawResults = await getFlights(query, {
      timeout: isOpenJaw ? 45000 : 25000,
      maxRetries: 1,
      retryDelay: 2000,
      signal,
    });

    const results: FlightResult[] = rawResults.map((r) => ({
      price: r.price,
      currency: opts.currency || "USD",
      flights: r.flights.map((leg) => ({
        airline: r.airlines[0] || "Unknown",
        flightNumber: "",
        departure: {
          airport: leg.from_airport.code,
          time: formatDt(leg.departure),
        },
        arrival: {
          airport: leg.to_airport.code,
          time: formatDt(leg.arrival),
        },
        durationMinutes: leg.duration,
        aircraft: leg.plane_type,
      })),
      totalDurationMinutes: r.flights.reduce((s, l) => s + l.duration, 0),
      stops: Math.max(0, r.flights.length - 1),
      emissions: r.carbon
        ? { typical: r.carbon.typical_on_route, actual: r.carbon.emission }
        : undefined,
      searchSpec,
    }));

    return { results, googleFlightsUrl };
  } catch (err) {
    const fallbackUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(`flights from ${opts.from} to ${opts.to} on ${opts.date}`)}`;
    const errResponse = (msg: string) => ({
      results: [] as FlightResult[],
      googleFlightsUrl: fallbackUrl,
      error: msg,
    });

    if (err instanceof CaptchaError)
      return errResponse("Google CAPTCHA — rate limited. Wait and retry.");
    if (err instanceof HttpError)
      return errResponse(`HTTP ${err.status} from Google Flights`);
    if (err instanceof TimeoutError) return errResponse("Search timed out");
    if (err instanceof ParseError)
      return errResponse(`Parse error: ${err.message}`);
    return errResponse(
      `Search error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

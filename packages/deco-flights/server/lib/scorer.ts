import type {
  FlightResult,
  ScoredFlightResult,
  TripPreferences,
} from "./types.ts";

const WEIGHTS = {
  price: 0.4,
  stops: 0.25,
  layover: 0.15,
  preferredAirports: 0.1,
  totalTime: 0.1,
};

function maxLayoverMinutes(result: FlightResult): number {
  let maxGap = 0;
  for (let i = 1; i < result.flights.length; i++) {
    const prevArrival = new Date(result.flights[i - 1].arrival.time).getTime();
    const nextDepart = new Date(result.flights[i].departure.time).getTime();
    const gap = (nextDepart - prevArrival) / (1000 * 60);
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return 1 - (value - min) / (max - min);
}

export function scoreResults(
  results: FlightResult[],
  prefs: TripPreferences,
): ScoredFlightResult[] {
  // Apply hard filters
  let filtered = results;

  if (prefs.maxStops !== undefined) {
    filtered = filtered.filter((r) => r.stops <= prefs.maxStops!);
  }

  if (prefs.maxLayoverHours !== undefined) {
    const maxMinutes = prefs.maxLayoverHours * 60;
    filtered = filtered.filter((r) => maxLayoverMinutes(r) <= maxMinutes);
  }

  if (prefs.maxPrice !== undefined) {
    filtered = filtered.filter((r) => r.price <= prefs.maxPrice!);
  }

  if (prefs.avoidAirlines?.length) {
    const avoid = new Set(prefs.avoidAirlines.map((a) => a.toLowerCase()));
    filtered = filtered.filter(
      (r) => !r.flights.some((f) => avoid.has(f.airline.toLowerCase())),
    );
  }

  if (filtered.length === 0) {
    // Relax numeric filters but always respect avoidAirlines
    let fallback = results;
    if (prefs.avoidAirlines?.length) {
      const avoid = new Set(prefs.avoidAirlines.map((a) => a.toLowerCase()));
      fallback = fallback.filter(
        (r) => !r.flights.some((f) => avoid.has(f.airline.toLowerCase())),
      );
    }
    return fallback
      .slice(0, 20)
      .map((r, i) => ({ ...r, score: 0, rank: i + 1 }));
  }

  // Compute ranges for normalization
  const prices = filtered.map((r) => r.price);
  const stops = filtered.map((r) => r.stops);
  const layovers = filtered.map((r) => maxLayoverMinutes(r));
  const durations = filtered.map((r) => r.totalDurationMinutes);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minStops = Math.min(...stops);
  const maxStops = Math.max(...stops);
  const minLayover = Math.min(...layovers);
  const maxLayover = Math.max(...layovers);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  const preferredSet = new Set(
    prefs.preferredAirports?.map((a) => a.toUpperCase()) ?? [],
  );
  const preferredAirlineSet = new Set(
    prefs.preferredAirlines?.map((a) => a.toLowerCase()) ?? [],
  );

  const scored: ScoredFlightResult[] = filtered.map((r) => {
    let score = 0;

    // Price score (lower is better)
    score += WEIGHTS.price * normalize(r.price, minPrice, maxPrice);

    // Stops score (fewer is better)
    score += WEIGHTS.stops * normalize(r.stops, minStops, maxStops);

    // Layover score (shorter is better)
    score +=
      WEIGHTS.layover * normalize(maxLayoverMinutes(r), minLayover, maxLayover);

    // Preferred airports bonus
    const hasPreferred = r.flights.some(
      (f) =>
        preferredSet.has(f.departure.airport.toUpperCase()) ||
        preferredSet.has(f.arrival.airport.toUpperCase()),
    );
    const hasPreferredAirline = r.flights.some((f) =>
      preferredAirlineSet.has(f.airline.toLowerCase()),
    );
    score +=
      WEIGHTS.preferredAirports *
      ((hasPreferred ? 0.5 : 0) + (hasPreferredAirline ? 0.5 : 0));

    // Total travel time (shorter is better)
    score +=
      WEIGHTS.totalTime *
      normalize(r.totalDurationMinutes, minDuration, maxDuration);

    return { ...r, score: Math.round(score * 1000) / 1000, rank: 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });

  return scored;
}

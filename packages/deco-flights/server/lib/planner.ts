import type { Trip, SearchPlan, SearchSpec } from "./types.ts";

const MAX_SEARCHES = 10;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

export function generateSearchPlan(trip: Trip): SearchPlan {
  const searches: SearchSpec[] = [];
  const departureDates = dateRange(
    trip.earliestDeparture,
    trip.latestDeparture,
  );

  const hasOpenJaw = trip.returnOrigins && trip.returnOrigins.length > 0;

  interface RoutePair {
    to: string;
    returnFrom?: string;
  }

  const routePairs: RoutePair[] = [];

  if (hasOpenJaw) {
    for (const dest of trip.destinations) {
      for (const retOrigin of trip.returnOrigins!) {
        if (dest !== retOrigin)
          routePairs.push({ to: dest, returnFrom: retOrigin });
      }
    }
    for (const dest of trip.destinations) {
      routePairs.push({ to: dest });
    }
  } else {
    for (const dest of trip.destinations) {
      routePairs.push({ to: dest });
    }
  }

  for (const departDate of departureDates) {
    const minReturn = addDays(departDate, trip.tripLengthDays.min);
    const maxReturn = addDays(departDate, trip.tripLengthDays.max);
    const effectiveLatestReturn =
      maxReturn < trip.latestReturn ? maxReturn : trip.latestReturn;

    if (minReturn > effectiveLatestReturn) continue;

    const returnDates = dateRange(minReturn, effectiveLatestReturn);

    for (const returnDate of returnDates) {
      for (const route of routePairs) {
        searches.push({
          from: trip.origin,
          to: route.to,
          departDate,
          returnDate,
          returnFrom: route.returnFrom,
        });
      }
    }
  }

  const totalCombinations = searches.length;
  const capped = totalCombinations > MAX_SEARCHES;

  if (capped) {
    const step = Math.ceil(totalCombinations / MAX_SEARCHES);
    const sampled: SearchSpec[] = [];
    for (
      let i = 0;
      i < totalCombinations && sampled.length < MAX_SEARCHES;
      i += step
    ) {
      sampled.push(searches[i]);
    }
    return { searches: sampled, totalCombinations, capped };
  }

  return { searches, totalCombinations, capped };
}

export function specKey(s: SearchSpec): string {
  return `${s.from}-${s.to}-${s.departDate}-${s.returnDate}-${s.returnFrom || ""}`;
}

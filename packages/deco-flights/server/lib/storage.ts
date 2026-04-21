import { join } from "node:path";
import { homedir } from "node:os";
import type { Trip, TripSummary } from "./types.ts";

const TRIPS_DIR = join(homedir(), ".deco", "flights", "trips");

async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
}

function tripPath(id: string): string {
  return join(TRIPS_DIR, `${id}.json`);
}

export async function saveTrip(trip: Trip): Promise<void> {
  await ensureDir(TRIPS_DIR);
  await Bun.write(tripPath(trip.id), JSON.stringify(trip, null, 2));
}

export async function loadTrip(id: string): Promise<Trip | null> {
  const file = Bun.file(tripPath(id));
  if (!(await file.exists())) return null;
  return file.json() as Promise<Trip>;
}

export async function listTrips(statusFilter?: string): Promise<TripSummary[]> {
  await ensureDir(TRIPS_DIR);
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(TRIPS_DIR);
  const summaries: TripSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const trip = (await Bun.file(join(TRIPS_DIR, file)).json()) as Trip;
    if (
      statusFilter &&
      statusFilter !== "all" &&
      trip.status !== statusFilter
    ) {
      continue;
    }
    const bestPrice = trip.results?.length
      ? Math.min(...trip.results.map((r) => r.price))
      : undefined;
    summaries.push({
      id: trip.id,
      name: trip.name,
      status: trip.status,
      origin: trip.origin,
      destinations: trip.destinations,
      earliestDeparture: trip.earliestDeparture,
      latestReturn: trip.latestReturn,
      resultCount: trip.results?.length ?? 0,
      bestPrice,
    });
  }

  return summaries.sort((a, b) =>
    b.earliestDeparture.localeCompare(a.earliestDeparture),
  );
}

export async function listFullTrips(statusFilter?: string): Promise<Trip[]> {
  await ensureDir(TRIPS_DIR);
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(TRIPS_DIR);
  const trips: Trip[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const trip = (await Bun.file(join(TRIPS_DIR, file)).json()) as Trip;
    if (
      statusFilter &&
      statusFilter !== "all" &&
      trip.status !== statusFilter
    ) {
      continue;
    }
    trips.push(trip);
  }

  return trips.sort((a, b) =>
    b.earliestDeparture.localeCompare(a.earliestDeparture),
  );
}

export async function deleteTrip(id: string): Promise<boolean> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(tripPath(id));
    return true;
  } catch {
    return false;
  }
}

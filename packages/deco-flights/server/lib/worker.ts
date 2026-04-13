import { loadTrip, saveTrip } from "./storage.ts";
import { generateSearchPlan } from "./planner.ts";
import { searchFlights } from "./scraper.ts";
import { scoreResults } from "./scorer.ts";
import type { FlightResult, SearchTask, Trip } from "./types.ts";

const CONCURRENCY = 3;
const DELAY_BETWEEN_WAVES_MS = 1000;

const activeWorkers = new Map<
  string,
  { stop: () => void; abort: AbortController }
>();

export function isWorkerRunning(tripId: string): boolean {
  return activeWorkers.has(tripId);
}

export function stopWorker(tripId: string): boolean {
  const worker = activeWorkers.get(tripId);
  if (worker) {
    worker.stop();
    worker.abort.abort();
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startWorker(tripId: string): void {
  if (activeWorkers.has(tripId)) return;

  let stopped = false;
  const abort = new AbortController();
  const handle = {
    stop: () => {
      stopped = true;
    },
    abort,
  };
  activeWorkers.set(tripId, handle);

  runWorker(tripId, () => stopped, abort.signal).finally(() => {
    activeWorkers.delete(tripId);
  });
}

async function executeTask(
  task: SearchTask,
  trip: Trip,
  signal: AbortSignal,
): Promise<FlightResult[]> {
  task.status = "running";
  task.startedAt = new Date().toISOString();
  task.error = undefined;

  const startTime = Date.now();

  try {
    const response = await searchFlights(
      {
        from: task.spec.from,
        to: task.spec.to,
        date: task.spec.departDate,
        returnDate: task.spec.returnDate,
        returnFrom: task.spec.returnFrom,
        passengers: trip.passengers,
        seatClass: trip.seatClass,
        maxStops: trip.preferences.maxStops,
        airlines: trip.preferences.preferredAirlines,
        currency: trip.preferences.currency || "USD",
      },
      task.spec,
      signal,
    );

    task.durationMs = Date.now() - startTime;
    task.finishedAt = new Date().toISOString();
    task.googleFlightsUrl = response.googleFlightsUrl;

    if (response.results.length > 0) {
      task.status = "done";
      task.resultCount = response.results.length;
      return response.results;
    } else if (response.error) {
      task.status = "error";
      task.error = response.error;
    } else {
      task.status = "done";
      task.resultCount = 0;
    }
  } catch (err) {
    task.durationMs = Date.now() - startTime;
    task.finishedAt = new Date().toISOString();
    task.status = "error";
    task.error = err instanceof Error ? err.message : "Unknown error";
  }
  return [];
}

async function runWorker(
  tripId: string,
  isStopped: () => boolean,
  signal: AbortSignal,
): Promise<void> {
  const trip = await loadTrip(tripId);
  if (!trip) return;

  if (!trip.searchPlan) {
    trip.searchPlan = generateSearchPlan(trip);
  }

  if (!trip.searchTasks) {
    trip.searchTasks = trip.searchPlan.searches.map((spec, i) => ({
      id: i,
      spec,
      status: "pending" as const,
      resultCount: 0,
    }));
  }

  for (const t of trip.searchTasks) {
    if (t.status === "running") {
      t.status = "pending";
      t.error = undefined;
      t.startedAt = undefined;
    }
  }

  trip.status = "researching";
  await saveTrip(trip);

  const allResults: FlightResult[] = [...(trip.results ?? [])];

  // Run searches in parallel waves of CONCURRENCY
  while (!isStopped()) {
    const pending = trip.searchTasks.filter(
      (t) => t.status === "pending" || t.status === "error",
    );
    if (pending.length === 0) break;

    const wave = pending.slice(0, CONCURRENCY);
    await saveTrip(trip); // save "running" states

    const waveResults = await Promise.all(
      wave.map((task) => executeTask(task, trip, signal)),
    );

    for (const results of waveResults) {
      allResults.push(...results);
    }

    // Score and persist after each wave
    trip.results = scoreResults(allResults, trip.preferences);
    trip.updatedAt = new Date().toISOString();
    await saveTrip(trip);

    if (!isStopped() && pending.length > CONCURRENCY) {
      await sleep(DELAY_BETWEEN_WAVES_MS);
    }
  }

  for (const t of trip.searchTasks ?? []) {
    if (t.status === "running") {
      t.status = "pending";
      t.startedAt = undefined;
    }
  }

  const remaining = (trip.searchTasks ?? []).filter(
    (t) => t.status === "pending",
  ).length;
  trip.status = remaining > 0 ? "draft" : "complete";
  trip.updatedAt = new Date().toISOString();
  await saveTrip(trip);
}

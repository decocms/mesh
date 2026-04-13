import { withRuntime } from "@decocms/runtime";
import { createPublicPrompt, createPublicResource } from "@decocms/runtime";
import { FLIGHT_SEARCH } from "./tools/flight-search.ts";
import { TRIP_CREATE } from "./tools/trip-create.ts";
import { TRIP_LIST } from "./tools/trip-list.ts";
import { TRIP_GET } from "./tools/trip-get.ts";
import { TRIP_UPDATE } from "./tools/trip-update.ts";
import { TRIP_DELETE } from "./tools/trip-delete.ts";
import { TRIP_EXECUTE } from "./tools/trip-execute.ts";
import { TRIP_STOP } from "./tools/trip-stop.ts";
import { TRIP_ADD_SEARCHES } from "./tools/trip-add-searches.ts";
import { AGENT_INSTRUCTIONS } from "./lib/agent-instructions.ts";
import { renderSearchResults } from "./ui/search-results.ts";
import { renderTripCard } from "./ui/trip-card.ts";
import { renderTripsDashboard } from "./ui/trips-dashboard.ts";
import { renderTripPlanner } from "./ui/trip-planner.ts";
import { loadTrip, listFullTrips } from "./lib/storage.ts";
import { isWorkerRunning } from "./lib/worker.ts";

const RESOURCE_MIME = "text/html;profile=mcp-app";
const port = Number(process.env.PORT) || 4747;
const API_ORIGIN = `http://localhost:${port}`;

// CSP override to allow the UI iframes to fetch from our REST API
const resourceCsp = {
  connectDomains: [API_ORIGIN],
};

const flightAssistantPrompt = createPublicPrompt({
  name: "flight-assistant",
  title: "Flight Assistant",
  description:
    "Instructions for the flight research workflow — how to help users plan trips, create searches, and present results.",
  execute: () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: AGENT_INSTRUCTIONS,
        },
      },
    ],
  }),
});

const searchResultsResource = createPublicResource({
  uri: "ui://deco-flights/search-results",
  name: "Flight Search Results",
  description: "Inline UI showing flight search results",
  mimeType: RESOURCE_MIME,
  read: () => ({
    uri: "ui://deco-flights/search-results",
    mimeType: RESOURCE_MIME,
    text: renderSearchResults(),
    _meta: { ui: { csp: resourceCsp } },
  }),
});

const tripCardResource = createPublicResource({
  uri: "ui://deco-flights/trip-card",
  name: "Trip Card",
  description: "Inline UI showing a trip summary card",
  mimeType: RESOURCE_MIME,
  read: () => ({
    uri: "ui://deco-flights/trip-card",
    mimeType: RESOURCE_MIME,
    text: renderTripCard(),
    _meta: { ui: { csp: resourceCsp } },
  }),
});

const tripsDashboardResource = createPublicResource({
  uri: "ui://deco-flights/trips-dashboard",
  name: "Trips Dashboard",
  description: "Fullscreen UI showing all saved trips with drill-down",
  mimeType: RESOURCE_MIME,
  read: () => ({
    uri: "ui://deco-flights/trips-dashboard",
    mimeType: RESOURCE_MIME,
    text: renderTripsDashboard(),
    _meta: { ui: { csp: resourceCsp } },
  }),
});

const tripPlannerResource = createPublicResource({
  uri: "ui://deco-flights/trip-planner",
  name: "Trip Planner",
  description:
    "Fullscreen UI showing trip details, preferences, and ranked results",
  mimeType: RESOURCE_MIME,
  read: () => ({
    uri: "ui://deco-flights/trip-planner",
    mimeType: RESOURCE_MIME,
    text: renderTripPlanner(),
    _meta: { ui: { csp: resourceCsp } },
  }),
});

const mcpServer = withRuntime({
  serverInfo: {
    name: "deco-flights",
    version: "0.1.0",
    instructions: AGENT_INSTRUCTIONS,
  },
  tools: [
    FLIGHT_SEARCH,
    TRIP_CREATE,
    TRIP_LIST,
    TRIP_GET,
    TRIP_UPDATE,
    TRIP_DELETE,
    TRIP_EXECUTE,
    TRIP_STOP,
    TRIP_ADD_SEARCHES,
  ],
  prompts: [flightAssistantPrompt],
  resources: [
    searchResultsResource,
    tripCardResource,
    tripsDashboardResource,
    tripPlannerResource,
  ],
  cors: {
    origin: "*",
  },
});

// REST API handler for direct fetch from UI iframes
function handleApi(req: Request): Response | null {
  const url = new URL(req.url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // GET /api/trips — list all trips (trimmed)
  if (url.pathname === "/api/trips" && req.method === "GET") {
    return (async () => {
      const trips = await listFullTrips();
      const trimmed = trips.map((t) => ({
        ...t,
        results: (t.results ?? []).slice(0, 20),
        _totalResults: t.results?.length ?? 0,
        workerRunning: isWorkerRunning(t.id),
      }));
      return new Response(JSON.stringify({ trips: trimmed }), {
        headers: corsHeaders,
      });
    })() as unknown as Response;
  }

  // GET /api/trips/:id — get single trip (trimmed)
  const tripMatch = url.pathname.match(/^\/api\/trips\/([^/]+)$/);
  if (tripMatch && req.method === "GET") {
    return (async () => {
      const trip = await loadTrip(tripMatch[1]);
      if (!trip) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }
      const trimmed = {
        ...trip,
        results: (trip.results ?? []).slice(0, 20),
        _totalResults: trip.results?.length ?? 0,
      };
      return new Response(
        JSON.stringify({
          trip: trimmed,
          workerRunning: isWorkerRunning(trip.id),
        }),
        { headers: corsHeaders },
      );
    })() as unknown as Response;
  }

  return null;
}

export default {
  fetch: async (req: Request, env?: unknown, ctx?: unknown) => {
    // Try REST API first
    const apiResponse = handleApi(req);
    if (apiResponse) return apiResponse;
    // Fall through to MCP handler
    return (mcpServer.fetch as Function)(req, env, ctx);
  },
  port,
};

console.log(
  `[deco-flights] MCP server running on http://localhost:${port}/mcp`,
);
console.log(`[deco-flights] REST API at http://localhost:${port}/api/trips`);

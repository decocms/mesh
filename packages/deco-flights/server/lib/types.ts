export interface TripPreferences {
  maxStops?: number;
  maxLayoverHours?: number;
  preferredAirports?: string[];
  avoidAirlines?: string[];
  preferredAirlines?: string[];
  maxPrice?: number;
  currency?: string;
}

export interface TripLengthDays {
  min: number;
  max: number;
}

export type TripStatus = "draft" | "researching" | "complete";

export type SearchTaskStatus = "pending" | "running" | "done" | "error";

export interface SearchTask {
  id: number;
  spec: SearchSpec;
  status: SearchTaskStatus;
  resultCount: number;
  googleFlightsUrl?: string;
  tier?: number;
  error?: string;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface Trip {
  id: string;
  name: string;
  status: TripStatus;
  origin: string;
  destinations: string[];
  returnOrigins?: string[];
  earliestDeparture: string;
  latestDeparture: string;
  earliestReturn: string;
  latestReturn: string;
  tripLengthDays: TripLengthDays;
  passengers: number;
  seatClass: string;
  preferences: TripPreferences;
  searchPlan?: SearchPlan;
  searchTasks?: SearchTask[];
  results?: ScoredFlightResult[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchSpec {
  from: string;
  to: string;
  departDate: string;
  returnDate: string;
  returnFrom?: string;
}

export interface SearchPlan {
  searches: SearchSpec[];
  totalCombinations: number;
  capped: boolean;
}

export interface FlightLeg {
  airline: string;
  flightNumber: string;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string };
  durationMinutes: number;
  aircraft: string;
}

export interface FlightResult {
  price: number;
  currency: string;
  flights: FlightLeg[];
  totalDurationMinutes: number;
  stops: number;
  emissions?: { typical: number; actual: number };
  searchSpec: SearchSpec;
}

export interface ScoredFlightResult extends FlightResult {
  score: number;
  rank: number;
}

export interface TripSummary {
  id: string;
  name: string;
  status: TripStatus;
  origin: string;
  destinations: string[];
  earliestDeparture: string;
  latestReturn: string;
  resultCount: number;
  bestPrice?: number;
}

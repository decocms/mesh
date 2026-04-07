/**
 * Server Constants
 *
 * Centralized configuration for server-related constants.
 * Respects BASE_URL and PORT environment variables.
 */

import { getSettings } from "../settings";

/**
 * Get the base URL for the server.
 *
 * Priority:
 * 1. BASE_URL environment variable (if set)
 * 2. http://localhost:{PORT} where PORT defaults to 3000
 */
export function getBaseUrl(): string {
  const settings = getSettings();
  if (settings.baseUrl) {
    return settings.baseUrl;
  }
  return `http://localhost:${settings.port ?? 3000}`;
}

/**
 * Get the internal loopback URL for server-to-server connections.
 * Always uses localhost:PORT so the server can reach itself
 * even when BASE_URL is a proxy hostname (e.g. tokyo.localhost).
 */
export function getInternalUrl(): string {
  return `http://localhost:${getSettings().port ?? 3000}`;
}

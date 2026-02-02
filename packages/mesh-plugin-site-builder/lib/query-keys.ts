/**
 * Query Key Constants
 *
 * Centralized query keys for consistent cache management.
 */

export const KEYS = {
  devServerStatus: (connectionId: string) =>
    ["site-builder", "dev-server-status", connectionId] as const,
  sitePages: (serverUrl: string) =>
    ["site-builder", "site-pages", serverUrl] as const,
  siteDetection: (connectionId: string) =>
    ["site-builder", "site-detection", connectionId] as const,
};

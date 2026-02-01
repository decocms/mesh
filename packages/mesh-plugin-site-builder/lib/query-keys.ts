/**
 * Query Key Factory for Site Builder Plugin
 *
 * Prefixes all keys with "site-builder" to prevent cache collisions.
 */

export const KEYS = {
  all: ["site-builder"] as const,
  siteDetection: (connectionId: string) =>
    ["site-builder", "site-detection", connectionId] as const,
  workspace: (connectionId: string) =>
    ["site-builder", "workspace", connectionId] as const,
  devServer: (connectionId: string) =>
    ["site-builder", "dev-server", connectionId] as const,
  pages: (connectionId: string) =>
    ["site-builder", "pages", connectionId] as const,
};

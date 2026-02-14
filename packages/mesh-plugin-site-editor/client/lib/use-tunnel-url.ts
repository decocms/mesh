/**
 * Hook to resolve the tunnel URL for the site preview.
 *
 * The tunnel URL is how users see their running local dev server in the
 * Mesh admin. They start their dev server locally, run `deco link` to
 * create a tunnel, and this hook resolves the preview URL.
 *
 * For Phase 1, the tunnel URL is extracted from the connection's metadata.
 * The connection metadata may contain a `previewUrl` field set during
 * `deco link`, or we fall back to null (showing a placeholder).
 */

import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { SITE_BINDING } from "@decocms/bindings";

export interface UseTunnelUrlResult {
  /** The resolved tunnel URL, or null if not available */
  url: string | null;
  /** Whether the URL is still being resolved */
  isLoading: boolean;
}

/**
 * Resolves the tunnel URL from the plugin context's connection metadata.
 *
 * The connection metadata may contain:
 * - `previewUrl`: The URL to the running local dev server (set by `deco link`)
 *
 * Returns null when no tunnel URL is configured, which causes the
 * PreviewPanel to show instructions for running `deco link`.
 */
export function useTunnelUrl(): UseTunnelUrlResult {
  const { connection } = usePluginContext<typeof SITE_BINDING>();

  // The preview URL lives in connection metadata, set by `deco link`.
  // The metadata field is Record<string, unknown> | null on the connection entity.
  const metadata = connection?.metadata;
  const previewUrl =
    metadata && typeof metadata.previewUrl === "string"
      ? metadata.previewUrl
      : null;

  return { url: previewUrl, isLoading: false };
}

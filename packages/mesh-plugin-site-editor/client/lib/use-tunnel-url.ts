/**
 * Hook to resolve the tunnel URL for the site preview.
 *
 * The tunnel URL is how users see their running local dev server in the
 * Mesh admin. They start their dev server locally and either:
 * - Enter the local URL (e.g., http://localhost:5173) directly
 * - Run `deco link` and use the generated tunnel URL
 *
 * The URL is persisted in the connection's metadata.previewUrl field
 * via COLLECTION_CONNECTIONS_UPDATE so it survives page reloads.
 */

import { useState } from "react";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { SITE_BINDING } from "@decocms/bindings";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";

export interface UseTunnelUrlResult {
  /** The resolved tunnel URL, or null if not available */
  url: string | null;
  /** Whether the URL is still being resolved */
  isLoading: boolean;
  /** Set the preview URL and persist it to connection metadata */
  setPreviewUrl: (url: string) => Promise<void>;
  /** Whether setPreviewUrl is in progress */
  isSaving: boolean;
}

/**
 * Resolves the tunnel URL from the plugin context's connection metadata.
 * Also provides a setter to persist a new preview URL.
 */
export function useTunnelUrl(): UseTunnelUrlResult {
  const { connection, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const { org } = useProjectContext();
  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const metadata = connection?.metadata;
  const previewUrl =
    metadata && typeof metadata.previewUrl === "string"
      ? metadata.previewUrl
      : null;

  const setPreviewUrl = async (url: string) => {
    if (!connectionId) return;
    setIsSaving(true);
    try {
      await selfClient.callTool({
        name: "COLLECTION_CONNECTIONS_UPDATE",
        arguments: {
          id: connectionId,
          data: {
            metadata: {
              ...((metadata as Record<string, unknown>) ?? {}),
              previewUrl: url,
            },
          },
        },
      });
      // Invalidate connections query so the new metadata is picked up
      queryClient.invalidateQueries();
    } finally {
      setIsSaving(false);
    }
  };

  return { url: previewUrl, isLoading: false, setPreviewUrl, isSaving };
}

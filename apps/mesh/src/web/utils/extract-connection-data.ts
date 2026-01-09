/**
 * Utility to extract connection data from a registry item for installation.
 * Shared between store server detail and inline installation flows.
 */

import type { OAuthConfig } from "@/tools/connection/schema";
import type {
  RegistryItem,
  MCPRegistryServer,
} from "@/web/components/store/types";
import { MCP_REGISTRY_DECOCMS_KEY } from "@/web/utils/constants";
import { getGitHubAvatarUrl } from "@/web/utils/github-icon";
import { getConnectionTypeLabel } from "@/web/utils/registry-utils";
import { generatePrefixedId } from "@/shared/utils/generate-id";

/**
 * Get a display name for a remote endpoint
 * Tries to extract a meaningful name from the URL path
 */
export function getRemoteDisplayName(remote?: { url?: string }): string {
  if (!remote?.url) return "Unknown";

  try {
    const url = new URL(remote.url);
    // Get the last meaningful path segment
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments.at(-1);
    if (lastSegment) {
      // Capitalize and clean up
      return lastSegment
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    // Fallback to hostname
    return url.hostname;
  } catch {
    return remote.url;
  }
}

/**
 * Options for extracting connection data
 */
export interface ExtractConnectionDataOptions {
  /** Index of the remote to use (default: 0) */
  remoteIndex?: number;
}

/**
 * Extract connection data from a registry item for installation
 */
export function extractConnectionData(
  item: RegistryItem,
  organizationId: string,
  userId: string,
  options?: ExtractConnectionDataOptions,
) {
  const server = item.server as MCPRegistryServer["server"] | undefined;

  const meshMeta = item._meta?.[MCP_REGISTRY_DECOCMS_KEY];

  const remoteIndex = options?.remoteIndex ?? 0;
  const remote = server?.remotes?.[remoteIndex];

  const connectionType = (getConnectionTypeLabel(remote?.type) || "HTTP") as
    | "HTTP"
    | "SSE"
    | "Websocket";

  const now = new Date().toISOString();

  const baseName =
    meshMeta?.friendlyName ||
    meshMeta?.friendly_name ||
    item.title ||
    server?.title ||
    server?.name ||
    "Unnamed MCP Server";

  // If there are multiple remotes, append the remote name/URL to differentiate
  const remotes = server?.remotes ?? [];
  const hasMultipleRemotes = remotes.length > 1;
  const remoteSuffix = hasMultipleRemotes
    ? ` (${getRemoteDisplayName(remote)})`
    : "";
  const title = baseName + remoteSuffix;

  const description = server?.description || null;

  // Get icon with GitHub fallback
  const icon =
    server?.icons?.[0]?.src || getGitHubAvatarUrl(server?.repository) || null;

  const rawOauthConfig = meshMeta?.oauth_config as
    | Record<string, unknown>
    | null
    | undefined;
  const oauthConfig: OAuthConfig | null =
    rawOauthConfig &&
    typeof rawOauthConfig.authorizationEndpoint === "string" &&
    typeof rawOauthConfig.tokenEndpoint === "string" &&
    typeof rawOauthConfig.clientId === "string" &&
    Array.isArray(rawOauthConfig.scopes) &&
    (rawOauthConfig.grantType === "authorization_code" ||
      rawOauthConfig.grantType === "client_credentials")
      ? (rawOauthConfig as unknown as OAuthConfig)
      : null;

  const configState = meshMeta?.configuration_state as
    | Record<string, unknown>
    | null
    | undefined;
  const configScopes = meshMeta?.configuration_scopes as
    | string[]
    | null
    | undefined;

  // Extract repository info for README support (stored in metadata)
  const repository = server?.repository
    ? {
        url: server.repository.url,
        source: server.repository.source,
        subfolder: server.repository.subfolder,
      }
    : null;

  return {
    id: generatePrefixedId("conn"),
    title,
    description,
    icon,
    app_name: meshMeta?.appName || server?.name || null,
    app_id: meshMeta?.id || item.id || null,
    connection_type: connectionType,
    connection_url: remote?.url || "",
    connection_token: null as string | null,
    connection_headers: null,
    oauth_config: oauthConfig,
    configuration_state: configState ?? null,
    configuration_scopes: configScopes ?? null,
    metadata: {
      source: "store",
      registry_item_id: item.id,
      verified: meshMeta?.verified ?? false,
      scopeName: meshMeta?.scopeName ?? null,
      toolsCount: meshMeta?.tools?.length ?? 0,
      publishedAt: meshMeta?.publishedAt ?? null,
      repository,
    },
    created_at: now,
    updated_at: now,
    created_by: userId,
    organization_id: organizationId,
    tools: null,
    bindings: null,
    status: "inactive" as const,
  };
}

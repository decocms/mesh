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
 * Get a display name for a package
 */
export function getPackageDisplayName(pkg?: { name?: string }): string {
  if (!pkg?.name) return "Unknown";
  // Extract package name (remove scope if present)
  const name = pkg.name.replace(/^@[^/]+\//, "");
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Options for extracting connection data
 */
export interface ExtractConnectionDataOptions {
  /** Index of the remote to use (default: 0) */
  remoteIndex?: number;
  /** Index of the package to use for STDIO connections (default: 0) */
  packageIndex?: number;
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
  const now = new Date().toISOString();

  const baseName =
    meshMeta?.friendlyName ||
    meshMeta?.friendly_name ||
    item.title ||
    server?.title ||
    server?.name ||
    "Unnamed MCP Server";

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

  // Check if we should use a package (STDIO/NPX) or a remote (HTTP/SSE)
  const packages = server?.packages ?? [];
  const remotes = server?.remotes ?? [];
  const packageIndex = options?.packageIndex ?? 0;
  const remoteIndex = options?.remoteIndex ?? 0;

  // If packageIndex is specified and packages exist, use package (STDIO)
  const usePackage = packages.length > 0 && options?.packageIndex !== undefined;
  const selectedPackage = usePackage ? packages[packageIndex] : null;
  const selectedRemote = !usePackage ? remotes[remoteIndex] : null;

  // Determine connection type and parameters
  let connectionType: "HTTP" | "SSE" | "Websocket" | "STDIO";
  let connectionUrl: string;
  let connectionHeaders: Record<string, unknown> | null = null;

  if (selectedPackage) {
    // STDIO connection using NPX
    connectionType = "STDIO";
    connectionUrl = "";
    connectionHeaders = {
      command: "npx",
      args: ["-y", selectedPackage.name],
    };
  } else if (selectedRemote) {
    connectionType = (getConnectionTypeLabel(selectedRemote.type) || "HTTP") as
      | "HTTP"
      | "SSE"
      | "Websocket";
    connectionUrl = selectedRemote.url || "";
  } else {
    // Fallback
    connectionType = "HTTP";
    connectionUrl = "";
  }

  // Build title with suffix for multiple options
  const hasMultipleRemotes = remotes.length > 1;
  const hasMultiplePackages = packages.length > 1;
  let titleSuffix = "";

  if (selectedPackage && hasMultiplePackages) {
    titleSuffix = ` (${getPackageDisplayName(selectedPackage)})`;
  } else if (selectedRemote && hasMultipleRemotes) {
    titleSuffix = ` (${getRemoteDisplayName(selectedRemote)})`;
  }

  const title = baseName + titleSuffix;

  return {
    id: generatePrefixedId("conn"),
    title,
    description,
    icon,
    app_name: meshMeta?.appName || server?.name || null,
    app_id: meshMeta?.id || item.id || null,
    connection_type: connectionType,
    connection_url: connectionUrl,
    connection_token: null as string | null,
    connection_headers: connectionHeaders,
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

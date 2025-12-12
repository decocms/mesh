/**
 * Utility to extract connection data from a registry item for installation.
 * Shared between store-app-detail and inline installation flows.
 */

import type { OAuthConfig } from "@/tools/connection/schema";
import type { RegistryItem } from "@/web/components/store/registry-items-section";
import type { MCPRegistryServer } from "@/web/components/store/registry-item-card";
import {
  MCP_REGISTRY_DECOCMS_KEY,
  MCP_REGISTRY_PUBLISHER_KEY,
} from "@/web/utils/constants";
import { getGitHubAvatarUrl } from "@/web/utils/github-icon";
import { getConnectionTypeLabel } from "@/web/utils/registry-utils";

/**
 * Extract connection data from a registry item for installation
 */
export function extractConnectionData(
  item: RegistryItem,
  organizationId: string,
  userId: string,
) {
  const server = item.server as MCPRegistryServer["server"] | undefined;

  const meshMeta =
    item._meta?.[MCP_REGISTRY_DECOCMS_KEY] ??
    server?._meta?.[MCP_REGISTRY_DECOCMS_KEY];
  const publisherMeta =
    item._meta?.[MCP_REGISTRY_PUBLISHER_KEY] ??
    server?._meta?.[MCP_REGISTRY_PUBLISHER_KEY];

  const appMetadata = publisherMeta?.metadata as
    | Record<string, unknown>
    | null
    | undefined;

  const remote = server?.remotes?.[0];

  const connectionType = (getConnectionTypeLabel(remote?.type) || "HTTP") as
    | "HTTP"
    | "SSE"
    | "Websocket";

  const now = new Date().toISOString();

  const title =
    publisherMeta?.friendlyName ||
    item.title ||
    server?.title ||
    server?.name ||
    "Unnamed App";

  const description = server?.description || null;

  // Get icon with GitHub fallback
  const icon =
    server?.icons?.[0]?.src || getGitHubAvatarUrl(server?.repository) || null;

  const rawOauthConfig = appMetadata?.oauth_config as
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

  const configState = appMetadata?.configuration_state as
    | Record<string, unknown>
    | null
    | undefined;
  const configScopes = appMetadata?.configuration_scopes as
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
    id: crypto.randomUUID(),
    title,
    description,
    icon,
    app_name: meshMeta?.appName || server?.name || null,
    app_id: meshMeta?.id || item.id || null,
    connection_type: connectionType,
    connection_url: remote?.url || "",
    connection_token: null,
    connection_headers: null,
    oauth_config: oauthConfig,
    configuration_state: configState ?? null,
    configuration_scopes: configScopes ?? null,
    metadata: {
      ...appMetadata,
      source: "store",
      registry_item_id: item.id,
      verified: meshMeta?.verified ?? false,
      scopeName: meshMeta?.scopeName ?? null,
      toolsCount: publisherMeta?.tools?.length ?? 0,
      publishedAt: meshMeta?.publishedAt ?? null,
      repository, // Repository info for README display
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

/**
 * Find a registry item by binding type (e.g., "@deco/database")
 * Returns the matching item or undefined
 */
export function findRegistryItemByBinding(
  items: RegistryItem[],
  bindingType: string,
): RegistryItem | undefined {
  if (!bindingType?.startsWith("@")) {
    return undefined;
  }

  // Parse @scope/appName format
  const [scope, appName] = bindingType.replace("@", "").split("/");
  if (!scope || !appName) {
    return undefined;
  }

  return items.find((item) => {
    const meta = item._meta?.["mcp.mesh"];
    const serverName = item.server?.name;

    // Match by meta (scopeName + appName)
    if (meta?.scopeName === scope && meta?.appName === appName) {
      return true;
    }

    // Match by server.name (format: "scope/appName")
    if (serverName === `${scope}/${appName}`) {
      return true;
    }

    return false;
  });
}

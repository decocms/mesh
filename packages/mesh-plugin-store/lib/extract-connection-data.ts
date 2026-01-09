/**
 * Utility to extract connection data from a registry item for installation.
 */

import type { OAuthConfig } from "@decocms/mesh-sdk";
import type { RegistryItem, MCPRegistryServer } from "../types";
import { getGitHubAvatarUrl, getConnectionTypeLabel } from "./utils";
import { nanoid } from "nanoid";

export const MCP_REGISTRY_MESH_KEY = "mcp.mesh";

function generatePrefixedId(prefix: string) {
  return `${prefix}_${nanoid()}`;
}

/**
 * Extract connection data from a registry item for installation
 */
export function extractConnectionData(
  item: RegistryItem,
  organizationId: string,
  userId: string,
) {
  const server = item.server as MCPRegistryServer["server"] | undefined;

  const meshMeta = item._meta?.[MCP_REGISTRY_MESH_KEY];

  const remote = server?.remotes?.[0];

  const connectionType = (getConnectionTypeLabel(remote?.type) || "HTTP") as
    | "HTTP"
    | "SSE"
    | "Websocket";

  const now = new Date().toISOString();

  const title =
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

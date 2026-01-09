/**
 * Well-known registry connection definitions for the Store plugin.
 */

import type { ConnectionCreateData } from "@decocms/mesh-sdk";

/** The Deco Store registry URL (public, no OAuth) */
export const DECO_STORE_URL = "https://api.decocms.com/mcp/registry";

export const WellKnownRegistryId = {
  REGISTRY: "registry",
  COMMUNITY_REGISTRY: "community-registry",
};

export const WellKnownOrgRegistryId = {
  REGISTRY: (org: string) => `${org}_${WellKnownRegistryId.REGISTRY}`,
  COMMUNITY_REGISTRY: (org: string) =>
    `${org}_${WellKnownRegistryId.COMMUNITY_REGISTRY}`,
};

/**
 * Get well-known connection definition for the Deco Store registry.
 *
 * @returns ConnectionCreateData for the Deco Store registry
 */
export function getWellKnownRegistryConnection(
  orgId: string,
): ConnectionCreateData {
  return {
    id: WellKnownOrgRegistryId.REGISTRY(orgId),
    title: "Deco Store",
    description: "Official deco MCP registry with curated integrations",
    connection_type: "HTTP",
    connection_url: DECO_STORE_URL,
    icon: "https://assets.decocache.com/decocms/00ccf6c3-9e13-4517-83b0-75ab84554bb9/596364c63320075ca58483660156b6d9de9b526e.png",
    app_name: "deco-registry",
    app_id: null,
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: "registry",
    },
  };
}

/**
 * Get well-known connection definition for the Community Registry.
 * Community MCP registry with thousands of handy MCPs.
 *
 * @returns ConnectionCreateData for the Community Registry
 */
export function getWellKnownCommunityRegistryConnection(): ConnectionCreateData {
  return {
    id: WellKnownRegistryId.COMMUNITY_REGISTRY,
    title: "MCP Registry",
    description: "Community MCP registry with thousands of handy MCPs",
    connection_type: "HTTP",
    connection_url: "https://sites-registry.decocache.com/mcp",
    icon: "https://assets.decocache.com/decocms/cd7ca472-0f72-463a-b0de-6e44bdd0f9b4/mcp.png",
    app_name: "mcp-registry",
    app_id: null,
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: "registry",
    },
  };
}

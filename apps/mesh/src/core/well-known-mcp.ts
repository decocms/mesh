import type { ConnectionCreateData } from "@/tools/connection/schema";

export const WellKnownMCPId = {
  SELF: "self",
  REGISTRY: "registry",
  COMMUNITY_REGISTRY: "community-registry",
};
export const WellKnownOrgMCPId = {
  SELF: (org: string) => `${org}_${WellKnownMCPId.SELF}`,
  REGISTRY: (org: string) => `${org}_${WellKnownMCPId.REGISTRY}`,
  COMMUNITY_REGISTRY: (org: string) =>
    `${org}_${WellKnownMCPId.COMMUNITY_REGISTRY}`,
};

/**
 * Get well-known connection definition for the Community Registry.
 * Community MCP registry with thousands of handy MCPs.
 *
 * @returns ConnectionCreateData for the Community Registry
 */
export function getWellKnownCommunityRegistryConnection(): ConnectionCreateData {
  return {
    id: WellKnownMCPId.COMMUNITY_REGISTRY,
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

/**
 * Get well-known connection definition for the Management MCP (SELF).
 * The connection URL is dynamic based on the base URL, so this is a function.
 *
 * @param baseUrl - The base URL for the MCP server (e.g., "http://localhost:3000" or "https://mesh.example.com")
 * @returns ConnectionCreateData for the Management MCP
 */
export function getWellKnownSelfConnection(
  baseUrl: string,
): ConnectionCreateData {
  return {
    id: WellKnownMCPId.SELF,
    title: "Mesh MCP",
    description: "The MCP for the mesh API",
    connection_type: "HTTP",
    connection_url: `${baseUrl}/mcp`,
    icon: "https://assets.decocache.com/mcp/09e44283-f47d-4046-955f-816d227c626f/app.png",
    app_name: "@deco/management-mcp",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: WellKnownOrgMCPId.SELF,
    },
  };
}

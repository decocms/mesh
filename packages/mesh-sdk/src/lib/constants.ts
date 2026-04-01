/**
 * Well-known MCP Constants
 *
 * Single source of truth for well-known MCP IDs and connection definitions.
 * This module provides constants and factory functions for creating standard MCP connections.
 */

import type {
  ConnectionCreateData,
  ConnectionEntity,
} from "../types/connection";
import type { VirtualMCPEntity } from "../types/virtual-mcp";

/**
 * Well-known MCP connection ID generators (org-scoped)
 *
 * These generate org-prefixed connection IDs for well-known MCPs.
 * Example: WellKnownOrgMCPId.SELF("my-org") => "my-org_self"
 */
export const WellKnownOrgMCPId = {
  /** Self/management MCP - used for management tools (monitoring, organization, user, collections) */
  SELF: (org: string) => `${org}_self`,
  /** Deco Store registry */
  REGISTRY: (org: string) => `${org}_registry`,
  /** Community MCP registry */
  COMMUNITY_REGISTRY: (org: string) => `${org}_community-registry`,
  /** Dev Assets MCP - local file storage for development */
  DEV_ASSETS: (org: string) => `${org}_dev-assets`,
  /** Site Diagnostics agent (note: prefix-first format, not org-first) */
  SITE_DIAGNOSTICS: (org: string) => `site-diagnostics_${org}`,
};

/**
 * Frontend connection ID for the self/management MCP endpoint.
 * Use this constant when calling management tools (ALL_TOOLS) from the frontend.
 * The endpoint is exposed at /mcp/self.
 */
export const SELF_MCP_ALIAS_ID = "self";

/**
 * Frontend connection ID for the dev-assets MCP endpoint.
 * Use this constant when calling object storage tools from the frontend in dev mode.
 * The endpoint is exposed at /mcp/dev-assets.
 */
export const DEV_ASSETS_MCP_ALIAS_ID = "dev-assets";

/**
 * Get well-known connection definition for the Deco Store registry.
 * This can be used by both frontend and backend to create registry connections.
 *
 * @returns ConnectionCreateData for the Deco Store registry
 */
export function getWellKnownRegistryConnection(
  orgId: string,
): ConnectionCreateData {
  return {
    id: WellKnownOrgMCPId.REGISTRY(orgId),
    title: "Deco Store",
    description: "Official deco MCP registry with curated integrations",
    connection_type: "HTTP",
    connection_url: "https://studio.decocms.com/org/deco/registry/mcp",
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
    id: "community-registry",
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
  orgId: string,
): ConnectionCreateData {
  return {
    id: WellKnownOrgMCPId.SELF(orgId),
    title: "Deco CMS",
    description: "The MCP for the CMS API",
    connection_type: "HTTP",
    // Custom url for targeting this mcp. It's a standalone endpoint that exposes all management tools.
    connection_url: `${baseUrl}/mcp/${SELF_MCP_ALIAS_ID}`,
    icon: "https://assets.decocache.com/mcp/09e44283-f47d-4046-955f-816d227c626f/app.png",
    app_name: "@deco/management-mcp",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: "self",
    },
  };
}

/**
 * Get well-known connection definition for Dev Assets MCP.
 * This is a dev-only MCP that provides local file storage at /data/assets/<org_id>/.
 * It implements the OBJECT_STORAGE_BINDING interface.
 *
 * @param baseUrl - The base URL for the MCP server (e.g., "http://localhost:3000")
 * @param orgId - The organization ID
 * @returns ConnectionCreateData for the Dev Assets MCP
 */
export function getWellKnownDevAssetsConnection(
  baseUrl: string,
  orgId: string,
): ConnectionCreateData {
  return {
    id: WellKnownOrgMCPId.DEV_ASSETS(orgId),
    title: "Local Files",
    description:
      "Local file storage for development. Files are stored in /data/assets/.",
    connection_type: "HTTP",
    connection_url: `${baseUrl}/mcp/${DEV_ASSETS_MCP_ALIAS_ID}`,
    // Folder icon
    icon: "https://api.iconify.design/lucide:folder.svg?color=%23888",
    app_name: "@deco/dev-assets-mcp",
    app_id: null,
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isFixed: true,
      devOnly: true,
      type: "dev-assets",
    },
  };
}

/**
 * Get well-known connection definition for OpenRouter.
 * Used by the chat UI to offer a one-click install when no model provider is connected.
 */
export function getWellKnownOpenRouterConnection(
  opts: { id?: string } = {},
): ConnectionCreateData {
  return {
    id: opts.id,
    title: "OpenRouter",
    description: "Access hundreds of LLM models from a single API",
    icon: "https://assets.decocache.com/decocms/b2e2f64f-6025-45f7-9e8c-3b3ebdd073d8/openrouter_logojpg.jpg",
    app_name: "openrouter",
    app_id: "openrouter",
    connection_type: "HTTP",
    connection_url: "https://sites-openrouter.decocache.com/mcp",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      source: "chat",
      verified: false,
      scopeName: "deco",
      toolsCount: 0,
      publishedAt: null,
      repository: null,
    },
  };
}

/**
 * Get well-known connection definition for MCP Studio.
 * Used by agents and workflows pages to offer installation when no provider is connected.
 */
export function getWellKnownMcpStudioConnection(): ConnectionCreateData {
  return {
    title: "MCP Studio",
    description: "An app that allows you to create and manage MCPs",
    icon: "https://assets.decocache.com/mcp/09e44283-f47d-4046-955f-816d227c626f/app.png",
    app_name: "mcp-studio",
    app_id: "65a1b407-b6af-41e2-a89f-ce9450c05bbc",
    connection_type: "HTTP",
    connection_url: "https://sites-vibemcp.decocache.com/mcp",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: false,
      type: "mcp-studio",
    },
  };
}

/**
 * Get well-known Decopilot Virtual MCP entity.
 * This is the default agent that aggregates ALL org connections.
 *
 * @param organizationId - Organization ID
 * @returns VirtualMCPEntity representing the Decopilot agent
 */
export function getWellKnownDecopilotVirtualMCP(
  organizationId: string,
): VirtualMCPEntity {
  return {
    id: getDecopilotId(organizationId),
    organization_id: organizationId,
    title: "Decopilot",
    description: "Default agent that aggregates all organization connections",
    icon: "https://assets.decocache.com/decocms/fd07a578-6b1c-40f1-bc05-88a3b981695d/f7fc4ffa81aec04e37ae670c3cd4936643a7b269.png",
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: "system",
    updated_by: undefined,
    metadata: { instructions: null },
    pinned: false,
    connections: [], // Empty connections array - gateway.ts will populate with all org connections
  };
}

/**
 * Decopilot ID prefix constant
 */
const DECOPILOT_PREFIX = "decopilot_";

/**
 * Check if a connection or virtual MCP ID is the Decopilot agent.
 *
 * @param id - Connection or virtual MCP ID to check
 * @returns The organization ID if the ID matches the Decopilot pattern (decopilot_{orgId}), null otherwise
 */
export function isDecopilot(id: string | null | undefined): string | null {
  if (!id) return null;
  if (!id.startsWith(DECOPILOT_PREFIX)) return null;
  return id.slice(DECOPILOT_PREFIX.length) || null;
}

/**
 * Get the Decopilot ID for a given organization.
 *
 * @param organizationId - Organization ID
 * @returns The Decopilot ID in the format `decopilot_{organizationId}`
 */
export function getDecopilotId(organizationId: string): string {
  return `${DECOPILOT_PREFIX}${organizationId}`;
}

/**
 * Site Diagnostics agent ID prefix
 */
const SITE_DIAGNOSTICS_PREFIX = "site-diagnostics_";

/**
 * Check if a connection or virtual MCP ID is the Site Diagnostics agent.
 *
 * @param id - Connection or virtual MCP ID to check
 * @returns The organization ID if the ID matches the Site Diagnostics pattern, null otherwise
 */
export function isSiteDiagnostics(
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  if (!id.startsWith(SITE_DIAGNOSTICS_PREFIX)) return null;
  return id.slice(SITE_DIAGNOSTICS_PREFIX.length) || null;
}

/**
 * Get the Site Diagnostics agent ID for a given organization.
 */
export function getSiteDiagnosticsId(organizationId: string): string {
  return `${SITE_DIAGNOSTICS_PREFIX}${organizationId}`;
}

export const SITE_DIAGNOSTICS_DESCRIPTION =
  "Blackbox diagnostics for storefronts — performance, cache, dead links, SEO, and e-commerce flows";

export const SITE_DIAGNOSTICS_ICON = "icon://SearchRefraction?color=cyan";

export const SITE_DIAGNOSTICS_MCP_URL =
  "https://sites-sitediagnostics.decocache.com/api/mcp";

export const SITE_DIAGNOSTICS_CONNECTION_DESCRIPTION =
  "Blackbox performance and SEO diagnostics for storefronts and high-traffic websites.";

export const SITE_DIAGNOSTICS_MAIN_TOOL = "diagnose";

export function getSiteDiagnosticsUiMetadata(connectionId: string) {
  return {
    pinnedViews: [
      {
        connectionId,
        toolName: SITE_DIAGNOSTICS_MAIN_TOOL,
        label: SITE_DIAGNOSTICS_MAIN_TOOL,
        icon: null,
      },
    ],
    layout: {
      defaultMainView: {
        type: "ext-apps",
        id: connectionId,
        toolName: SITE_DIAGNOSTICS_MAIN_TOOL,
      },
      chatDefaultOpen: false,
    },
  };
}

export const SITE_EDITOR_AGENT = {
  id: "site-editor",
  title: "Site Editor",
  icon: "icon://Globe01?color=violet",
} as const;

export const SITE_DIAGNOSTICS_AGENT = {
  id: "site-diagnostics",
  title: "Site Diagnostics",
  icon: SITE_DIAGNOSTICS_ICON,
} as const;

/**
 * Get well-known Site Diagnostics Virtual MCP entity.
 * Blackbox diagnostics agent for storefronts — always available per org.
 */
export function getWellKnownSiteDiagnosticsVirtualMCP(
  organizationId: string,
): VirtualMCPEntity {
  return {
    id: getSiteDiagnosticsId(organizationId),
    organization_id: organizationId,
    title: "Site Diagnostics",
    description: SITE_DIAGNOSTICS_DESCRIPTION,
    icon: SITE_DIAGNOSTICS_ICON,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: "system",
    updated_by: undefined,
    pinned: false,
    metadata: {
      instructions: SITE_DIAGNOSTICS_INSTRUCTIONS,
    },
    connections: [
      {
        connection_id: getSiteDiagnosticsId(organizationId),
        selected_tools: null,
        selected_resources: null,
        selected_prompts: null,
      },
    ],
  };
}

/**
 * Get well-known Site Diagnostics connection entity (for listing alongside other connections).
 * Points to the standalone site-diagnostics MCP App deployed externally.
 */
export function getWellKnownSiteDiagnosticsConnection(
  organizationId: string,
): ConnectionEntity {
  return {
    id: getSiteDiagnosticsId(organizationId),
    organization_id: organizationId,
    title: "Site Diagnostics",
    description: SITE_DIAGNOSTICS_DESCRIPTION,
    icon: SITE_DIAGNOSTICS_ICON,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: "system",
    updated_by: undefined,
    connection_type: "HTTP",
    connection_url: "https://site-diagnostics.decocache.com/api/mcp",
    app_name: "site-diagnostics",
    app_id: "site-diagnostics",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: "site-diagnostics",
    },
    tools: [],
    bindings: [],
  };
}

export function getWellKnownDecopilotConnection(
  organizationId: string,
): ConnectionEntity {
  const virtual = getWellKnownDecopilotVirtualMCP(organizationId);

  return {
    ...virtual,
    id: virtual.id!,
    connection_type: "VIRTUAL",
    connection_url: `virtual://${virtual.id}`,
    app_name: "decopilot",
    app_id: "decopilot",
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: {
      isDefault: true,
      type: "decopilot",
    },
    tools: [],
    bindings: [],
  };
}

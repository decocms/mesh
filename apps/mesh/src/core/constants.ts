/**
 * Shared constants for MCP Mesh
 *
 * Constants used by both server-side and web code.
 */

/** MCP Mesh metadata key in tool _meta */
export const MCP_MESH_KEY = "mcp.mesh";

/**
 * MCP Apps feature flag
 *
 * When enabled, Mesh will render interactive UIs for tools
 * that declare UI resources via _meta["ui/resourceUri"].
 *
 * This is an experimental feature and is disabled by default.
 */
export const MCP_APPS_ENABLED = true;

/**
 * MCP Apps configuration
 */
export const MCP_APPS_CONFIG = {
  /** Minimum height for MCP App iframes in pixels */
  minHeight: 100,
  /** Maximum height for MCP App iframes in pixels */
  maxHeight: 600,
  /** Default height for MCP App iframes in pixels */
  defaultHeight: 300,
  /** Whether to show raw JSON output alongside MCP Apps in developer mode */
  showRawOutputInDevMode: true,
} as const;

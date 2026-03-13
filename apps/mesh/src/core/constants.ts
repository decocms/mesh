/**
 * Shared constants for MCP Mesh
 *
 * Constants used by both server-side and web code.
 */

/** MCP Mesh metadata key in tool _meta */
export const MCP_MESH_KEY = "mcp.mesh";

/**
 * Default timeout for MCP tool calls in milliseconds (used by Decopilot).
 * The MCP SDK default is 60 seconds (60000ms).
 */
export const MCP_TOOL_CALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Timeout for upstream MCP tool calls (proxy → MCP server) in milliseconds.
 */
export const MCP_UPSTREAM_TOOL_CALL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

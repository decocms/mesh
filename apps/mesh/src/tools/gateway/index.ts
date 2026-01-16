/**
 * Gateway Management Tools
 *
 * @deprecated Use virtual-mcp tools instead.
 * This file re-exports from virtual-mcp for backward compatibility.
 */

// Re-export everything from virtual-mcp
export {
  // New tool names
  COLLECTION_VIRTUAL_MCP_CREATE,
  COLLECTION_VIRTUAL_MCP_LIST,
  COLLECTION_VIRTUAL_MCP_GET,
  COLLECTION_VIRTUAL_MCP_UPDATE,
  COLLECTION_VIRTUAL_MCP_DELETE,
  // Backward compatibility aliases
  COLLECTION_GATEWAY_CREATE,
  COLLECTION_GATEWAY_LIST,
  COLLECTION_GATEWAY_GET,
  COLLECTION_GATEWAY_UPDATE,
  COLLECTION_GATEWAY_DELETE,
  // Types
  type ToolSelectionMode,
  type VirtualMCPConnection,
  type VirtualMCPEntity,
  type VirtualMCPCreateData,
  type VirtualMCPUpdateData,
  type GatewayConnection,
  type GatewayEntity,
  type GatewayCreateData,
  type GatewayUpdateData,
  type GatewayToolSelectionStrategy,
} from "../virtual-mcp";

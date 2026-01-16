/**
 * Gateway Entity Schema
 *
 * @deprecated Use virtual-mcp/schema.ts instead.
 * This file re-exports from virtual-mcp/schema.ts for backward compatibility.
 */

// Re-export everything from virtual-mcp schema
export {
  // Primary types (new names)
  VirtualMCPEntitySchema,
  VirtualMCPCreateDataSchema,
  VirtualMCPUpdateDataSchema,
  // Primary types
  type VirtualMCPEntity,
  type VirtualMCPCreateData,
  type VirtualMCPUpdateData,
  type VirtualMCPConnection,
  // Backward compatibility aliases
  GatewayEntitySchema,
  GatewayCreateDataSchema,
  GatewayUpdateDataSchema,
  type GatewayEntity,
  type GatewayCreateData,
  type GatewayUpdateData,
  type GatewayConnection,
  // Shared types
  type ToolSelectionMode,
} from "../virtual-mcp/schema";

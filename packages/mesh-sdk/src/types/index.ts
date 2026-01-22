export {
  ConnectionEntitySchema,
  ConnectionCreateDataSchema,
  ConnectionUpdateDataSchema,
  isStdioParameters,
  parseVirtualUrl,
  buildVirtualUrl,
  type ConnectionEntity,
  type ConnectionCreateData,
  type ConnectionUpdateData,
  type ConnectionParameters,
  type HttpConnectionParameters,
  type StdioConnectionParameters,
  type OAuthConfig,
  type ToolDefinition,
} from "./connection";

export {
  VirtualMCPEntitySchema,
  VirtualMCPCreateDataSchema,
  VirtualMCPUpdateDataSchema,
  type VirtualMCPEntity,
  type VirtualMCPCreateData,
  type VirtualMCPUpdateData,
  type VirtualMCPConnection,
  type ToolSelectionMode,
} from "./virtual-mcp";

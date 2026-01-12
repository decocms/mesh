/**
 * Gateway Management Tools
 *
 * Export all gateway-related tools with collection binding compliance.
 */

// Collection-compliant CRUD tools
export { COLLECTION_GATEWAY_CREATE } from "./create";
export { COLLECTION_GATEWAY_LIST } from "./list";
export { COLLECTION_GATEWAY_GET } from "./get";
export { COLLECTION_GATEWAY_UPDATE } from "./update";
export { COLLECTION_GATEWAY_DELETE } from "./delete";

// Re-export schema types (only types, not runtime schemas)
export type {
  ToolSelectionMode,
  GatewayConnection,
  GatewayEntity,
  GatewayCreateData,
  GatewayUpdateData,
} from "./schema";

// Re-export strategy type from gateway (not from schema since it's not persisted)
export type { GatewayToolSelectionStrategy } from "../../gateway/strategy";

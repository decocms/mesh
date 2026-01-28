/**
 * Virtual Tool Management Tools
 *
 * Export all virtual tool-related tools with collection binding compliance.
 * Virtual tools are custom JavaScript tools defined on Virtual MCPs.
 */

// Collection-compliant CRUD tools
export { COLLECTION_VIRTUAL_TOOLS_CREATE } from "./create";
export { COLLECTION_VIRTUAL_TOOLS_LIST } from "./list";
export { COLLECTION_VIRTUAL_TOOLS_GET } from "./get";
export { COLLECTION_VIRTUAL_TOOLS_UPDATE } from "./update";
export { COLLECTION_VIRTUAL_TOOLS_DELETE } from "./delete";

// Re-export schema types
export type {
  VirtualToolEntity,
  VirtualToolCreateData,
  VirtualToolUpdateData,
  VirtualToolDefinition,
} from "./schema";

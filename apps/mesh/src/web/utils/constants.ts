import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { z } from "zod";

export const MCP_REGISTRY_DECOCMS_KEY = "mcp.mesh";

// DEPRECATED: mcp.mesh/publisher-provided no longer exists in the new structure
// All data is now in _meta["mcp.mesh"] at root level
// export const MCP_REGISTRY_PUBLISHER_KEY = "mcp.mesh/publisher-provided";

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  format?: string;
  description?: string;
  enum?: string[];
  maxLength?: number;
  anyOf?: JsonSchema[];
  [key: string]: unknown;
};

/**
 * Base collection JSONSchema
 * Generated from BaseCollectionEntitySchema using Zod's native JSON Schema conversion.
 */
export const BaseCollectionJsonSchema: JsonSchema = z.toJSONSchema(
  BaseCollectionEntitySchema,
  { target: "draft-7" },
) as JsonSchema;

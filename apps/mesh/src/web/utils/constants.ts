import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { z } from "zod";

// Re-export from core for backwards compatibility
export { MCP_MESH_KEY as MCP_MESH_DECOCMS_KEY } from "@/core/constants";

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

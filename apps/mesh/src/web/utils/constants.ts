import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import type { JsonSchema } from "@decocms/bindings/workflow";
import { z } from "zod";

// Re-export from core for backwards compatibility
export { MCP_MESH_KEY as MCP_MESH_DECOCMS_KEY } from "@/core/constants";

export type { JsonSchema };

/**
 * Base collection JSONSchema
 * Generated from BaseCollectionEntitySchema using Zod's native JSON Schema conversion.
 */
export const BaseCollectionJsonSchema: JsonSchema = z.toJSONSchema(
  BaseCollectionEntitySchema,
  { target: "draft-7" },
) as JsonSchema;

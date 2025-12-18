import { zodToJsonSchema } from "zod-to-json-schema";
import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";

export const MCP_REGISTRY_DECOCMS_KEY = "mcp.mesh";

export const MCP_REGISTRY_PUBLISHER_KEY = "mcp.mesh/publisher-provided";

export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  format?: string;
  description?: string;
  enum?: string[];
  maxLength?: number;
  [key: string]: unknown;
};

/**
 * Base collection JSONSchema
 * Generated from BaseCollectionEntitySchema using zod-to-json-schema
 */
export const BaseCollectionJsonSchema: JsonSchema = zodToJsonSchema(
  BaseCollectionEntitySchema,
  {
    target: "jsonSchema7",
  },
) as JsonSchema;

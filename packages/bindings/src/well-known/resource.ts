/**
 * Resources Well-Known Binding
 *
 * Defines the interface for stored resources.
 * These resources are exposed as a collection for CRUD operations.
 */

import { z } from "zod";
import type { Binder } from "../core/binder";
import {
  BaseCollectionEntitySchema,
  createCollectionBindings,
} from "./collections";
import type { Resource as McpResource } from "@modelcontextprotocol/sdk/types.js";

/**
 * Resource entity schema extending MCP Resource definition for storage.
 *
 * Note: Stored fields use snake_case to align with database columns.
 */
export const ResourceSchema = BaseCollectionEntitySchema.extend({
  uri: z.string().describe("Resource URI"),
  name: z.string().describe("Human-readable resource name"),
  mime_type: z.string().nullish().describe("MIME type"),
  text: z.string().nullish().describe("Text payload (optional)"),
  blob: z.string().nullish().describe("Base64-encoded payload (optional)"),
}).describe("Stored resource entity");

export type ResourceCollectionEntity = z.infer<typeof ResourceSchema>;

/**
 * Helper type to ensure MCP compatibility at the edge.
 */
export type ResourceMcpDefinition = McpResource;

/**
 * RESOURCES Collection Binding
 */
export const RESOURCES_COLLECTION_BINDING = createCollectionBindings(
  "resources",
  ResourceSchema,
);

/**
 * RESOURCES Binding (CRUD)
 */
export const RESOURCES_BINDING = [
  ...RESOURCES_COLLECTION_BINDING,
] as const satisfies Binder;

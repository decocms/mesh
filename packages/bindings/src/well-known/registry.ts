/**
 * Registry App Well-Known Binding
 *
 * Defines the interface for accessing public registry apps.
 * Any MCP that implements this binding can provide a list of available apps
 * with their configurations and tools.
 *
 * This binding includes:
 * - Collection bindings for LIST and GET operations (read-only)
 * - Only exposes public apps (unlisted: false)
 * - Removes sensitive fields (connection details, workspace info)
 */

import { z } from "zod";
import {
  BaseCollectionEntitySchema,
  createCollectionBindings,
} from "./collections";

/**
 * Tool definition schema from registry
 */
const RegistryToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

/**
 * MCP Registry Server schema extending Collection Entity base
 * Combines BaseCollectionEntitySchema with MCP Registry Spec format
 * https://spec.modelcontextprotocol.io/specification/2025-03-26/registry/
 */
export const MCPRegistryServerSchema = BaseCollectionEntitySchema.extend({
  // MCP Registry Spec structure
  _meta: z
    .object({
      "io.decocms": z
        .object({
          id: z.string(),
          verified: z.boolean(),
          scopeName: z.string(),
          appName: z.string(),
          friendlyName: z.string().nullable().optional(),
          metadata: z.record(z.string(), z.unknown()).nullable().optional(),
          publishedAt: z.string().datetime().optional(),
          updatedAt: z.string().datetime().optional(),
          tools: z
            .array(RegistryToolSchema)
            .nullable()
            .optional()
            .describe("Available tools exposed by this app"),
        })
        .optional(),
    })
    .optional(),
  server: z.object({
    $schema: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).optional(),
    name: z.string().describe("The server name (scope/app)"),
    title: z.string().optional().describe("User-friendly title"),
    description: z.string().optional().describe("Server description"),
    icons: z
      .array(
        z.object({
          src: z.string(),
          mimeType: z.string().optional(),
          sizes: z.array(z.string()).optional(),
          theme: z.enum(["light", "dark"]).optional(),
        }),
      )
      .optional(),
    remotes: z
      .array(
        z.object({
          type: z.enum(["http", "stdio", "sse"]),
          url: z.string().optional(),
          headers: z.array(z.unknown()).optional(),
        }),
      )
      .optional(),
    packages: z.array(z.unknown()).optional(),
    repository: z
      .object({
        url: z.string(),
        source: z.string().optional(),
        subfolder: z.string().optional(),
      })
      .optional(),
    version: z.string().optional(),
    websiteUrl: z.string().optional(),
  }),
});

export type RegistryAppCollectionEntity = z.infer<
  typeof MCPRegistryServerSchema
>;

/**
 * Registry App Collection Binding (read-only)
 *
 * Collection bindings for registry apps (read-only).
 * Provides LIST and GET operations for public apps.
 * Only includes public apps (unlisted: false).
 *
 * Returns servers in MCP Registry Spec format with:
 * - _meta: DecoCMS-specific metadata (id, verified, tools, etc.)
 * - server: MCP Registry Spec compliant server definition
 */
const REGISTRY_APP_COLLECTION_BINDING = createCollectionBindings(
  "registry_app",
  MCPRegistryServerSchema,
  { readOnly: true },
);

/**
 * Registry App Binding
 *
 * Defines the interface for accessing public registry apps.
 * Any MCP that implements this binding can provide a searchable list of apps.
 *
 * Required tools:
 * - COLLECTION_REGISTRY_APP_LIST: List available apps with filtering and pagination
 * - COLLECTION_REGISTRY_APP_GET: Get a single app by ID
 */
export const REGISTRY_APP_BINDING = REGISTRY_APP_COLLECTION_BINDING;

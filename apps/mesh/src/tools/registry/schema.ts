import { z } from "zod";

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Canonical schema for registry items across all tool outputs.
 * This is the single source of truth — frontend types should derive from this.
 */
export const RegistryItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  icon: z.string().nullable().describe("Icon URL for the item"),
  verified: z.boolean().optional(),
  publisher: z.string().nullable(),
  registryId: z.string().describe("Connection ID of the source registry"),
  registryName: z
    .string()
    .describe("Human-readable name of the source registry"),
  server: z.object({
    name: z.string(),
    description: z.string().optional(),
    version: z.string().optional(),
    remotes: z
      .array(
        z.object({
          type: z.string().optional(),
          url: z.string().optional(),
        }),
      )
      .optional(),
    packages: z
      .array(
        z.object({
          identifier: z.string(),
          name: z.string().optional(),
          version: z.string().optional(),
        }),
      )
      .optional(),
    repository: z
      .object({
        url: z.string().optional(),
      })
      .optional(),
  }),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  updatedAt: z.string().nullable().describe("ISO 8601 timestamp"),
});

export type RegistryItem = z.infer<typeof RegistryItemSchema>;

// ============================================================================
// Cursor Schema (internal, opaque to callers)
// ============================================================================

export const InternalCursorSchema = z.object({
  phase: z.enum(["non-community", "community"]),
  registryCursors: z.record(
    z.string(),
    z.union([z.string(), z.literal("EXHAUSTED")]),
  ),
});

export type InternalCursor = z.infer<typeof InternalCursorSchema>;

// ============================================================================
// REGISTRY_LIST Schemas
// ============================================================================

export const RegistryListInputSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(24)
    .describe("Maximum number of items to return per page"),
  cursor: z
    .string()
    .optional()
    .describe("Opaque pagination cursor from a previous response"),
  registryId: z
    .string()
    .optional()
    .describe(
      "Scope results to a single registry connection ID. Omit to query all enabled registries.",
    ),
  tags: z.array(z.string()).optional().describe("Filter items by tags"),
  categories: z
    .array(z.string())
    .optional()
    .describe("Filter items by categories"),
});

export const RegistryListOutputSchema = z.object({
  items: z.array(RegistryItemSchema),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pagination cursor for the next page, or null if no more items"),
  hasMore: z
    .boolean()
    .describe("Whether more items are available beyond this page"),
});

// ============================================================================
// REGISTRY_SEARCH Schemas
// ============================================================================

export const RegistrySearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Search query to match against item name, title, and description",
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(24)
    .describe("Maximum number of results to return"),
  registryId: z
    .string()
    .optional()
    .describe(
      "Scope search to a single registry connection ID. Omit to search all enabled registries.",
    ),
});

export const RegistrySearchOutputSchema = z.object({
  items: z.array(RegistryItemSchema),
  total: z
    .number()
    .optional()
    .describe("Total number of matching items, if known"),
});

// ============================================================================
// REGISTRY_GET Schemas
// ============================================================================

export const RegistryGetInputSchema = z.object({
  registryId: z
    .string()
    .describe("The registry connection ID that contains this item"),
  itemId: z.string().describe("The unique identifier of the item to retrieve"),
});

export const RegistryGetOutputSchema = RegistryItemSchema;

// ============================================================================
// REGISTRY_GET_VERSIONS Schemas
// ============================================================================

export const RegistryGetVersionsInputSchema = z.object({
  registryId: z
    .string()
    .describe("The registry connection ID that contains this item"),
  itemId: z.string().describe("The unique identifier of the item"),
});

export const RegistryGetVersionsOutputSchema = z.object({
  versions: z
    .array(
      z.object({
        version: z.string(),
        createdAt: z.string().nullable().describe("ISO 8601 timestamp"),
        changelog: z.string().nullable(),
      }),
    )
    .describe("Available versions for this item, newest first"),
});

// ============================================================================
// REGISTRY_GET_FILTERS Schemas
// ============================================================================

export const RegistryGetFiltersInputSchema = z.object({
  registryId: z
    .string()
    .optional()
    .describe(
      "Scope to a single registry. Omit to aggregate filters from all enabled registries.",
    ),
});

export const RegistryGetFiltersOutputSchema = z.object({
  tags: z
    .array(
      z.object({
        value: z.string(),
        count: z.number(),
      }),
    )
    .describe("Available tags with item counts"),
  categories: z
    .array(
      z.object({
        value: z.string(),
        count: z.number(),
      }),
    )
    .describe("Available categories with item counts"),
});

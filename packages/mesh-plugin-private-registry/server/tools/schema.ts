import { CollectionListInputSchema } from "@decocms/bindings/collections";
import { z } from "zod";

const RegistryServerSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  websiteUrl: z.string().optional(),
  icons: z
    .array(
      z.object({
        src: z.string(),
      }),
    )
    .optional(),
  remotes: z
    .array(
      z.object({
        type: z.string().optional(),
        url: z.string().optional(),
        name: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  packages: z
    .array(
      z.object({
        identifier: z.string(),
        version: z.string().optional(),
      }),
    )
    .optional(),
  repository: z
    .object({
      url: z.string().optional(),
      source: z.string().optional(),
      subfolder: z.string().optional(),
    })
    .optional(),
});

const RegistryToolSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
});

const RegistryItemMetaSchema = z
  .object({
    "mcp.mesh": z
      .object({
        verified: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        categories: z.array(z.string()).optional(),
        friendly_name: z.string().nullable().optional(),
        short_description: z.string().max(160).nullable().optional(),
        owner: z.string().nullable().optional(),
        readme: z.string().max(50000).nullable().optional(),
        readme_url: z.string().url().nullable().optional(),
        has_remote: z.boolean().optional(),
        has_oauth: z.boolean().optional(),
        tools: z.array(RegistryToolSchema).optional(),
      })
      .optional(),
  })
  .catchall(z.unknown());

export const RegistryItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  _meta: RegistryItemMetaSchema.optional(),
  server: RegistryServerSchema,
  is_public: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().optional(),
});

const RegistryCreateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  _meta: RegistryItemMetaSchema.optional(),
  server: RegistryServerSchema,
  is_public: z.boolean().optional(),
});

const RegistryUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  _meta: RegistryItemMetaSchema.optional(),
  server: RegistryServerSchema.optional(),
  is_public: z.boolean().optional(),
});

export const RegistryListInputSchema = CollectionListInputSchema.extend({
  tags: z
    .array(z.string())
    .optional()
    .describe("Filter by tags (returns items with any of the specified tags)"),
  categories: z
    .array(z.string())
    .optional()
    .describe(
      "Filter by categories (returns items with any of the specified categories)",
    ),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor for fetching the next page of results"),
}).describe(
  "List registry items with optional filtering, sorting, and pagination. All parameters are optional.",
);

export const RegistryListOutputSchema = z.object({
  items: z.array(RegistryItemSchema),
  totalCount: z.number(),
  hasMore: z.boolean().optional(),
  nextCursor: z.string().optional(),
});

export const RegistryGetInputSchema = z
  .object({
    id: z
      .string()
      .optional()
      .describe("Unique identifier of the registry item"),
    name: z
      .string()
      .optional()
      .describe("Name of the registry item (alias for id)"),
  })
  .refine((data) => data.id || data.name, {
    message: "At least one of 'id' or 'name' is required",
  })
  .describe(
    "Get a registry item by ID or name. At least one parameter is required.",
  );

export const RegistryGetOutputSchema = z.object({
  item: RegistryItemSchema.nullable(),
});

export const RegistryCreateInputSchema = z.object({
  data: RegistryCreateSchema,
});

export const RegistryCreateOutputSchema = z.object({
  item: RegistryItemSchema,
});

export const RegistryBulkCreateInputSchema = z.object({
  items: z.array(RegistryCreateSchema).min(1),
});

export const RegistryBulkCreateOutputSchema = z.object({
  created: z.number(),
  errors: z.array(
    z.object({
      id: z.string(),
      error: z.string(),
    }),
  ),
});

export const RegistryUpdateInputSchema = z.object({
  id: z.string(),
  data: RegistryUpdateSchema,
});

export const RegistryUpdateOutputSchema = z.object({
  item: RegistryItemSchema,
});

export const RegistryDeleteInputSchema = z.object({
  id: z.string(),
});

export const RegistryDeleteOutputSchema = z.object({
  item: RegistryItemSchema,
});

export const RegistryFiltersOutputSchema = z.object({
  tags: z.array(
    z.object({
      value: z.string(),
      count: z.number(),
    }),
  ),
  categories: z.array(
    z.object({
      value: z.string(),
      count: z.number(),
    }),
  ),
});

const RegistryAIGenerateTypeSchema = z.enum([
  "description",
  "short_description",
  "tags",
  "categories",
  "readme",
]);

// ─── Search (lightweight) ───

export const RegistrySearchInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Free-text search across id, title, description, and server name",
      ),
    tags: z
      .array(z.string())
      .optional()
      .describe("Filter by tags (AND semantics)"),
    categories: z
      .array(z.string())
      .optional()
      .describe("Filter by categories (AND semantics)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max results to return (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  })
  .describe(
    "Lightweight search returning minimal fields to save tokens. " +
      "Search by free-text query, tags, or categories. " +
      "Returns id, title, short_description, tags, categories, is_public, and icon only.",
  );

const RegistrySearchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  short_description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  icon: z.string().nullable().optional(),
});

export const RegistrySearchOutputSchema = z.object({
  items: z.array(RegistrySearchItemSchema),
  totalCount: z.number(),
  hasMore: z.boolean().optional(),
  nextCursor: z.string().optional(),
});

// ─── AI Generate ───

export const RegistryAIGenerateInputSchema = z.object({
  type: RegistryAIGenerateTypeSchema.describe("Which content to generate"),
  llmConnectionId: z
    .string()
    .describe("Connection ID of a language model provider"),
  modelId: z.string().describe("Model ID to use for generation"),
  context: z.object({
    name: z.string().optional(),
    provider: z.string().optional(),
    url: z.string().optional(),
    owner: z.string().optional(),
    repositoryUrl: z.string().optional(),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    availableTags: z.array(z.string()).optional(),
    availableCategories: z.array(z.string()).optional(),
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().nullable().optional(),
        }),
      )
      .optional(),
  }),
});

export const RegistryAIGenerateOutputSchema = z.object({
  result: z.string().optional(),
  items: z.array(z.string()).optional(),
});

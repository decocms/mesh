import { Hono } from "hono";
import type { ServerPluginContext } from "@decocms/bindings/server-plugin";
import { withRuntime } from "@decocms/runtime";
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { RegistryItemStorage } from "../storage/registry-item";
import {
  RegistryListInputSchema,
  RegistryListOutputSchema,
  RegistryGetInputSchema,
  RegistryGetOutputSchema,
  RegistryFiltersOutputSchema,
} from "../tools/schema";

/**
 * Create public MCP tools for the registry
 * These tools only expose public items
 */
function createPublicMCPTools(storage: RegistryItemStorage, orgId: string) {
  const LIST_TOOL = createTool({
    id: "COLLECTION_REGISTRY_APP_LIST",
    description: "List public registry items",
    inputSchema: RegistryListInputSchema,
    outputSchema: RegistryListOutputSchema,
    execute: async ({ context }) => {
      const result = await storage.listPublic(orgId, {
        limit: context.limit,
        offset: context.offset,
        cursor: context.cursor,
        tags: context.tags,
        categories: context.categories,
        where: context.where,
      });
      return result;
    },
  });

  const GET_TOOL = createTool({
    id: "COLLECTION_REGISTRY_APP_GET",
    description: "Get a public registry item by ID or name",
    inputSchema: RegistryGetInputSchema,
    outputSchema: RegistryGetOutputSchema,
    execute: async ({ context }) => {
      const identifier = context.id ?? context.name;
      if (!identifier) {
        return { item: null };
      }
      const item = await storage.findByIdOrName(orgId, identifier);
      // Only return if public
      if (item && item.is_public) {
        return { item };
      }
      return { item: null };
    },
  });

  const VERSIONS_TOOL = createTool({
    id: "COLLECTION_REGISTRY_APP_VERSIONS",
    description: "Get available versions of a public registry item",
    inputSchema: RegistryGetInputSchema,
    outputSchema: z.object({
      versions: z.array(RegistryGetOutputSchema.shape.item),
    }),
    execute: async ({ context }) => {
      const identifier = context.id ?? context.name;
      if (!identifier) {
        return { versions: [] };
      }
      const item = await storage.findByIdOrName(orgId, identifier);
      // Only return if public
      if (item && item.is_public) {
        return { versions: [item] };
      }
      return { versions: [] };
    },
  });

  const FILTERS_TOOL = createTool({
    id: "COLLECTION_REGISTRY_APP_FILTERS",
    description: "Get available tags and categories for public registry items",
    inputSchema: z.object({}),
    outputSchema: RegistryFiltersOutputSchema,
    execute: async () => {
      return await storage.getFilters(orgId, { publicOnly: true });
    },
  });

  return [LIST_TOOL, GET_TOOL, VERSIONS_TOOL, FILTERS_TOOL];
}

/**
 * Mount public MCP server for the registry at /org/:orgSlug/registry
 */
export function publicMCPServerRoutes(
  app: Hono,
  ctx: ServerPluginContext,
): void {
  // Use db as any to access both plugin tables and core tables like organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = ctx.db as any;
  const storage = new RegistryItemStorage(db);

  // Mount MCP server at /org/:orgSlug/registry/*
  app.all("/org/:orgSlug/registry/*", async (c) => {
    const orgSlug = c.req.param("orgSlug");

    console.log(
      `[Public Registry MCP] Request for org slug: ${orgSlug}, path: ${c.req.path}`,
    );

    // Lookup organization by slug
    const org = await db
      .selectFrom("organization")
      .select(["id", "slug", "name"])
      .where("slug", "=", orgSlug)
      .executeTakeFirst();

    console.log(`[Public Registry MCP] Found org:`, org);

    if (!org) {
      console.log(`[Public Registry MCP] Organization not found: ${orgSlug}`);
      return c.json({ error: "Organization not found" }, 404);
    }

    // Create MCP server with public tools
    const tools = createPublicMCPTools(storage, org.id);
    const mcpServer = withRuntime({
      tools: () => tools,
    });

    // Rewrite the request URL to remove the /org/:orgSlug/registry prefix
    // MCP server expects paths like /mcp, so we forward the remaining path
    const originalUrl = new URL(c.req.url);
    const mcpPath = c.req.path.replace(`/org/${orgSlug}/registry`, "");
    const newUrl = new URL(mcpPath || "/", originalUrl.origin);

    // Copy query params
    originalUrl.searchParams.forEach((value, key) => {
      newUrl.searchParams.set(key, value);
    });

    console.log(
      `[Public Registry MCP] Rewriting ${originalUrl.pathname} to ${newUrl.pathname}`,
    );

    // Create a new request with the rewritten URL
    const newRequest = new Request(newUrl.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
    });

    // Forward request to MCP server
    return await mcpServer.fetch(newRequest, { organizationId: org.id, db }, c);
  });
}

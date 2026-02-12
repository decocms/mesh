import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistrySearchInputSchema,
  RegistrySearchOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

/**
 * Lightweight search tool that returns minimal fields to save tokens.
 * Searches by free-text query (id, title, description, server name),
 * tags, and categories. Returns only: id, title, tags, categories, is_public.
 */
export const COLLECTION_REGISTRY_APP_SEARCH: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_SEARCH",
  description:
    "Search registry items returning minimal data (id, title, tags, categories, is_public). " +
    "Use this instead of LIST when you need to find items efficiently without loading full details. " +
    "Supports free-text search across id, title, description, and server name, " +
    "plus filtering by tags and categories.",
  inputSchema: RegistrySearchInputSchema,
  outputSchema: RegistrySearchOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistrySearchInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    return storage.items.search(meshCtx.organization.id, typedInput);
  },
};

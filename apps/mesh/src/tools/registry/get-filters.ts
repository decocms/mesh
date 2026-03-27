import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import {
  RegistryGetFiltersInputSchema,
  RegistryGetFiltersOutputSchema,
} from "./schema";
import {
  fanOutToRegistries,
  getEnabledRegistries,
  validateRegistryId,
} from "./registry-service";

export const REGISTRY_GET_FILTERS = defineTool({
  name: "REGISTRY_GET_FILTERS",
  description:
    "Get available filter options (tags, categories) from enabled registries. Use these filters with REGISTRY_LIST to narrow results.",
  inputSchema: RegistryGetFiltersInputSchema,
  outputSchema: RegistryGetFiltersOutputSchema,
  annotations: {
    title: "Get Registry Filters",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, ctx) => {
    await ctx.access.check();
    requireOrganization(ctx);

    const enabledRegistries = await getEnabledRegistries(ctx);
    const toolListCache = new Map<string, string[]>();

    let registries = enabledRegistries;
    if (input.registryId) {
      const source = validateRegistryId(input.registryId, enabledRegistries);
      registries = [source];
    }

    const results = await fanOutToRegistries(
      ctx,
      registries,
      "FILTERS",
      () => ({}),
      toolListCache,
    );

    // Merge filter results from all registries
    const tagsMap = new Map<string, number>();
    const categoriesMap = new Map<string, number>();

    for (const result of results) {
      if (!result.data || typeof result.data !== "object") continue;
      const data = result.data as Record<string, unknown>;

      const tags = Array.isArray(data.tags) ? data.tags : [];
      for (const tag of tags) {
        if (tag && typeof tag === "object" && "value" in tag) {
          const raw = tag as Record<string, unknown>;
          const value =
            typeof raw.value === "string" ? raw.value : String(raw.value);
          const count = typeof raw.count === "number" ? raw.count : 0;
          tagsMap.set(value, (tagsMap.get(value) ?? 0) + count);
        }
      }

      const categories = Array.isArray(data.categories) ? data.categories : [];
      for (const cat of categories) {
        if (cat && typeof cat === "object" && "value" in cat) {
          const raw = cat as Record<string, unknown>;
          const value =
            typeof raw.value === "string" ? raw.value : String(raw.value);
          const count = typeof raw.count === "number" ? raw.count : 0;
          categoriesMap.set(value, (categoriesMap.get(value) ?? 0) + count);
        }
      }
    }

    const toSorted = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));

    return {
      tags: toSorted(tagsMap),
      categories: toSorted(categoriesMap),
    };
  },
});

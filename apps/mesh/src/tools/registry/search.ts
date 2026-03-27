import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import {
  RegistrySearchInputSchema,
  RegistrySearchOutputSchema,
} from "./schema";
import {
  classifyRegistries,
  fanOutToRegistries,
  getEnabledRegistries,
  normalizeItems,
  validateRegistryId,
} from "./registry-service";

export const REGISTRY_SEARCH = defineTool({
  name: "REGISTRY_SEARCH",
  description:
    "Search for MCP servers across all enabled registries by name, description, or capability. Returns results from non-community registries first, followed by community results.",
  inputSchema: RegistrySearchInputSchema,
  outputSchema: RegistrySearchOutputSchema,
  annotations: {
    title: "Search Registry",
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

    // If registryId is provided, scope to that single registry
    let registries = enabledRegistries;
    if (input.registryId) {
      const source = validateRegistryId(input.registryId, enabledRegistries);
      registries = [source];
    }

    const { nonCommunity, community } = classifyRegistries(registries);

    const buildArgs = () => ({
      query: input.query,
      limit: input.limit,
    });

    // Fan out to non-community first
    const ncResults = await fanOutToRegistries(
      ctx,
      nonCommunity,
      "SEARCH",
      buildArgs,
      toolListCache,
    );
    const ncItems = ncResults.flatMap(normalizeItems);

    // Only query community registries if non-community didn't fill the limit
    if (ncItems.length >= input.limit) {
      return { items: ncItems.slice(0, input.limit) };
    }

    const cResults = await fanOutToRegistries(
      ctx,
      community,
      "SEARCH",
      buildArgs,
      toolListCache,
    );

    const items = [...ncItems, ...cResults.flatMap(normalizeItems)].slice(
      0,
      input.limit,
    );

    return { items };
  },
});

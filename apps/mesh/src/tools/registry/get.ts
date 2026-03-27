import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import { RegistryGetInputSchema, RegistryItemSchema } from "./schema";
import {
  callRegistryTool,
  getEnabledRegistries,
  inferToolName,
  normalizeItem,
  validateRegistryId,
} from "./registry-service";

export const REGISTRY_GET = defineTool({
  name: "REGISTRY_GET",
  description:
    "Get detailed information about a specific MCP server from a registry. Requires the registry connection ID and item ID.",
  inputSchema: RegistryGetInputSchema,
  outputSchema: RegistryItemSchema,
  annotations: {
    title: "Get Registry Item",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, ctx) => {
    await ctx.access.check();
    const org = requireOrganization(ctx);

    const enabledRegistries = await getEnabledRegistries(ctx);
    const source = validateRegistryId(input.registryId, enabledRegistries);

    const toolName = inferToolName(input.registryId, org.id, "GET");
    const result = await callRegistryTool(ctx, input.registryId, toolName, {
      id: input.itemId,
    });

    // Handle wrapped response { item: ... }
    const rawItem =
      result && typeof result === "object" && "item" in result
        ? (result as Record<string, unknown>).item
        : result;

    return normalizeItem(rawItem, source.id, source.title);
  },
});

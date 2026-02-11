import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryTestConnectionListInputSchema,
  RegistryTestConnectionListOutputSchema,
} from "./test-schemas";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_CONNECTION_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_CONNECTION_LIST",
  description:
    "List test connection mappings for private registry MCP test runs, including auth status",
  inputSchema: RegistryTestConnectionListInputSchema,
  outputSchema: RegistryTestConnectionListOutputSchema,
  handler: async (_input, ctx) => {
    RegistryTestConnectionListInputSchema.parse(_input);
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const mappings = await storage.testConnections.list(
      meshCtx.organization.id,
    );
    const items = await Promise.all(
      mappings.map(async (mapping) => {
        const item = await storage.items.findById(
          meshCtx.organization!.id,
          mapping.item_id,
        );
        const remoteUrl = item?.server.remotes?.find((r) => r.url)?.url ?? null;
        return {
          mapping,
          item,
          remoteUrl,
        };
      }),
    );
    return { items };
  },
};

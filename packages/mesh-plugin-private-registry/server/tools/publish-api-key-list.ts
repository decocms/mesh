import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { PublishApiKeyListOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_API_KEY_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_API_KEY_LIST",
  description:
    "List all publish request API keys for the current organization (metadata only, no key values)",
  inputSchema: z.object({}),
  outputSchema: PublishApiKeyListOutputSchema,

  handler: async (_input, ctx) => {
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const items = await storage.publishApiKeys.list(meshCtx.organization.id);

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        prefix: item.prefix,
        createdAt: item.created_at,
      })),
    };
  },
};

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  PublishApiKeyGenerateInputSchema,
  PublishApiKeyGenerateOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_API_KEY_GENERATE: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_API_KEY_GENERATE",
  description:
    "Generate a new API key for publish requests. The key value is only returned once — store it securely!",
  inputSchema: PublishApiKeyGenerateInputSchema,
  outputSchema: PublishApiKeyGenerateOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof PublishApiKeyGenerateInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const { entity, key } = await storage.publishApiKeys.generate(
      meshCtx.organization.id,
      typedInput.name,
    );

    return {
      id: entity.id,
      name: entity.name,
      prefix: entity.prefix,
      key,
      createdAt: entity.created_at,
    };
  },
};

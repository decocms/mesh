import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  PublishApiKeyGenerateInputSchema,
  PublishApiKeyGenerateOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_PUBLISH_API_KEY_GENERATE: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_API_KEY_GENERATE",
  description:
    "Generate a new API key for publish requests. The key value is only returned once — store it securely!",
  inputSchema: PublishApiKeyGenerateInputSchema,
  outputSchema: PublishApiKeyGenerateOutputSchema,

  handler: orgHandler(PublishApiKeyGenerateInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const { entity, key } = await storage.publishApiKeys.generate(
      ctx.organization.id,
      input.name,
    );

    return {
      id: entity.id,
      name: entity.name,
      prefix: entity.prefix,
      key,
      createdAt: entity.created_at,
    };
  }),
};

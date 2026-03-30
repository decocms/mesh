import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  PublishApiKeyRevokeInputSchema,
  PublishApiKeyRevokeOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_PUBLISH_API_KEY_REVOKE: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_API_KEY_REVOKE",
  description:
    "Revoke a publish request API key. The key can no longer be used for authentication.",
  inputSchema: PublishApiKeyRevokeInputSchema,
  outputSchema: PublishApiKeyRevokeOutputSchema,

  handler: orgHandler(PublishApiKeyRevokeInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const revoked = await storage.publishApiKeys.revoke(
      ctx.organization.id,
      input.keyId,
    );

    if (!revoked) {
      throw new Error("API key not found");
    }

    return { success: true, keyId: input.keyId };
  }),
};

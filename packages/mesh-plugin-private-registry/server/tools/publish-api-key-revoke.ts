import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  PublishApiKeyRevokeInputSchema,
  PublishApiKeyRevokeOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_API_KEY_REVOKE: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_API_KEY_REVOKE",
  description:
    "Revoke a publish request API key. The key can no longer be used for authentication.",
  inputSchema: PublishApiKeyRevokeInputSchema,
  outputSchema: PublishApiKeyRevokeOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof PublishApiKeyRevokeInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const revoked = await storage.publishApiKeys.revoke(
      meshCtx.organization.id,
      typedInput.keyId,
    );

    if (!revoked) {
      throw new Error("API key not found");
    }

    return { success: true, keyId: typedInput.keyId };
  },
};

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  PublishRequestDeleteInputSchema,
  PublishRequestDeleteOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_REQUEST_DELETE: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_REQUEST_DELETE",
  description:
    "Delete a publish request from the private registry in the current organization",
  inputSchema: PublishRequestDeleteInputSchema,
  outputSchema: PublishRequestDeleteOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof PublishRequestDeleteInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const item = await storage.publishRequests.delete(
      meshCtx.organization.id,
      typedInput.id,
    );
    return { item };
  },
};

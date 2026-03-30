import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  PublishRequestListInputSchema,
  PublishRequestListOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_REQUEST_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_REQUEST_LIST",
  description:
    "List publish requests for the private registry in the current organization",
  inputSchema: PublishRequestListInputSchema,
  outputSchema: PublishRequestListOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof PublishRequestListInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    return storage.publishRequests.list(meshCtx.organization.id, typedInput);
  },
};

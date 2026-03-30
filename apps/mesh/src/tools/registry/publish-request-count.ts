import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { PublishRequestCountOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_REQUEST_COUNT: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_REQUEST_COUNT",
  description:
    "Count pending private registry publish requests for the current organization",
  inputSchema: z.object({}),
  outputSchema: PublishRequestCountOutputSchema,

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
    const pending = await storage.publishRequests.countPending(
      meshCtx.organization.id,
    );
    return { pending };
  },
};

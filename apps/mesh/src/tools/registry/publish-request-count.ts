import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import { z } from "zod";
import { PublishRequestCountOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_REQUEST_COUNT = defineTool({
  name: "REGISTRY_PUBLISH_REQUEST_COUNT" as const,
  description:
    "Count pending private registry publish requests for the current organization",
  inputSchema: z.object({}),
  outputSchema: PublishRequestCountOutputSchema,

  handler: async (_input, ctx) => {
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const storage = getPluginStorage();
    const pending = await storage.publishRequests.countPending(organization.id);
    return { pending };
  },
});

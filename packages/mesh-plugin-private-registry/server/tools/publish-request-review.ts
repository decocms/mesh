import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  PublishRequestReviewInputSchema,
  PublishRequestReviewOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_PUBLISH_REQUEST_REVIEW: ServerPluginToolDefinition = {
  name: "REGISTRY_PUBLISH_REQUEST_REVIEW",
  description:
    "Approve or reject a publish request for the private registry in the current organization",
  inputSchema: PublishRequestReviewInputSchema,
  outputSchema: PublishRequestReviewOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof PublishRequestReviewInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const item = await storage.publishRequests.updateStatus(
      meshCtx.organization.id,
      typedInput.id,
      typedInput.status,
      typedInput.reviewerNotes ?? null,
    );
    return { item };
  },
};

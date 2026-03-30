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

    // When approving, verify the requested_id/title don't conflict with existing registry items
    if (typedInput.status === "approved") {
      const request = await storage.publishRequests.findById(
        meshCtx.organization.id,
        typedInput.id,
      );
      if (!request) {
        throw new Error(`Publish request not found: ${typedInput.id}`);
      }

      const targetId = request.requested_id ?? request.server?.name;
      // Check by id
      if (targetId) {
        const existing = await storage.items.findByIdOrName(
          meshCtx.organization.id,
          targetId,
        );
        if (existing) {
          throw new Error(
            `Cannot approve: a registry item with id "${existing.id}" already exists. Delete or rename it first.`,
          );
        }
      }
      // Check by title (it may differ from the id)
      if (request.title && request.title !== targetId) {
        const existingByTitle = await storage.items.findByIdOrName(
          meshCtx.organization.id,
          request.title,
        );
        if (existingByTitle) {
          throw new Error(
            `Cannot approve: a registry item with title "${existingByTitle.title}" already exists. Delete or rename it first.`,
          );
        }
      }
    }

    const item = await storage.publishRequests.updateStatus(
      meshCtx.organization.id,
      typedInput.id,
      typedInput.status,
      typedInput.reviewerNotes ?? null,
    );
    return { item };
  },
};

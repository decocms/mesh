/**
 * EVENT_PUBLISH Tool
 *
 * Publishes an event to the event bus.
 * The source connection ID is automatically set from the caller's auth token.
 */

import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { PublishEventInputSchema, PublishEventOutputSchema } from "./schema";

export const EVENT_PUBLISH = defineTool({
  name: "EVENT_PUBLISH",
  description:
    "Publish an event to the event bus. The source is automatically set to the caller's connection ID.",

  inputSchema: PublishEventInputSchema,
  outputSchema: PublishEventOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    // Get the source connection ID from the caller's token
    const sourceConnectionId = ctx.connectionId;
    if (!sourceConnectionId) {
      throw new Error(
        "Connection ID required to publish events. Use a connection-scoped token.",
      );
    }

    // Publish the event
    const event = await ctx.eventBus.publish(
      organization.id,
      sourceConnectionId,
      {
        type: input.type,
        subject: input.subject,
        data: input.data,
      },
    );

    return {
      id: event.id,
      type: event.type,
      source: event.source,
      time: event.time,
    };
  },
});

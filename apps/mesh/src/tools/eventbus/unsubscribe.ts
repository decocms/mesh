/**
 * EVENT_UNSUBSCRIBE Tool
 *
 * Removes a subscription.
 */

import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { UnsubscribeInputSchema, UnsubscribeOutputSchema } from "./schema";

export const EVENT_UNSUBSCRIBE = defineTool({
  name: "EVENT_UNSUBSCRIBE",
  description: "Unsubscribe from events by removing a subscription.",

  inputSchema: UnsubscribeInputSchema,
  outputSchema: UnsubscribeOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    // Get the caller's connection ID for verification
    const connectionId = ctx.connectionId;

    // Verify the subscription belongs to the caller's connection
    const subscription = await ctx.eventBus.getSubscription(
      organization.id,
      input.subscriptionId,
    );

    if (!subscription) {
      throw new Error(`Subscription not found: ${input.subscriptionId}`);
    }

    if (connectionId && subscription.connectionId !== connectionId) {
      throw new Error(
        "Cannot unsubscribe from a subscription owned by another connection",
      );
    }

    // Remove the subscription
    const result = await ctx.eventBus.unsubscribe(
      organization.id,
      input.subscriptionId,
    );

    return {
      success: result.success,
      subscriptionId: input.subscriptionId,
    };
  },
});

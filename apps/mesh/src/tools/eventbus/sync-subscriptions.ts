/**
 * EVENT_SYNC_SUBSCRIPTIONS Tool
 *
 * Syncs subscriptions to a desired state.
 * Creates new subscriptions, deletes removed ones, and updates changed filters.
 * Subscriptions are identified by (eventType, publisher).
 */

import { WellKnownMCPId } from "@/core/well-known-mcp";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import {
  SyncSubscriptionsInputSchema,
  SyncSubscriptionsOutputSchema,
} from "./schema";

export const EVENT_SYNC_SUBSCRIPTIONS = defineTool({
  name: "EVENT_SYNC_SUBSCRIPTIONS",
  description:
    "Sync subscriptions to desired state. Creates new, deletes removed, updates changed filters. Subscriptions are identified by (eventType, publisher).",

  inputSchema: SyncSubscriptionsInputSchema,
  outputSchema: SyncSubscriptionsOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    // Get the subscriber connection ID from the caller's token
    const connectionId = ctx.connectionId;
    if (!connectionId) {
      throw new Error(
        "Connection ID required to sync subscriptions. Use a connection-scoped token.",
      );
    }

    // Check permissions for each publisher
    for (const sub of input.subscriptions) {
      if (sub.publisher) {
        const hasPermission = await ctx.boundAuth.hasPermission({
          [sub.publisher]: [`event@${sub.eventType}`],
        });
        if (!hasPermission) {
          throw new Error(
            `Not authorized to subscribe to events from publisher '${sub.publisher}' for event type '${sub.eventType}'.`,
          );
        }
      }
    }

    // Sync the subscriptions
    const result = await ctx.eventBus.syncSubscriptions(organization.id, {
      connectionId,
      subscriptions: input.subscriptions,
    });
    const cronSubscriptions = result.subscriptions.filter(
      (sub) =>
        sub.eventType?.startsWith("cron/") &&
        sub.publisher === WellKnownMCPId.SELF,
    );

    await Promise.all(
      cronSubscriptions.map(async (sub) => {
        const cron = sub.eventType.split("/")[1];
        cron &&
          (await ctx.eventBus.publish(organization.id, WellKnownMCPId.SELF, {
            type: sub.eventType,
            cron,
            data: {},
          }));
      }),
    );

    return {
      created: result.created,
      updated: result.updated,
      deleted: result.deleted,
      unchanged: result.unchanged,
      subscriptions: result.subscriptions.map((sub) => ({
        id: sub.id,
        connectionId: sub.connectionId,
        eventType: sub.eventType,
        publisher: sub.publisher,
        filter: sub.filter,
        enabled: sub.enabled,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
    };
  },
});

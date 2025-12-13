/**
 * Event Bus Notification Module
 *
 * Handles notifying subscriber connections of events using the MCP proxy
 * and the Event Receiver binding.
 */

import type { CloudEvent } from "@decocms/bindings";
import { EventSubscriberBinding } from "@decocms/bindings";
import { createMCPProxy } from "../api/routes/proxy";
import type { MeshContext } from "../core/mesh-context";
import type { NotifySubscriberFn } from "./interface";

/**
 * Create a notify subscriber function that uses MCP proxy
 *
 * This function creates the callback used by the event bus worker
 * to deliver events to subscriber connections via the ON_EVENTS tool.
 *
 * @param getSystemContext - Function that returns a system context for making proxy calls
 * @returns NotifySubscriberFn callback
 */
export function createNotifySubscriber(
  getSystemContext: () => Promise<MeshContext>,
): NotifySubscriberFn {
  return async (
    connectionId: string,
    events: CloudEvent[],
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get a system context for the notification
      const ctx = await getSystemContext();

      // Create MCP proxy for the subscriber connection
      const proxy = await createMCPProxy(connectionId, ctx, true);

      // Use the Event Subscriber binding - pass the whole proxy object
      // Same pattern as LanguageModelBinding.forClient(proxy) in models.ts
      const client = EventSubscriberBinding.forClient(proxy);

      // Call ON_EVENTS with the batch of events
      const result = await client.ON_EVENTS({ events });

      return {
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[EventBus] Failed to notify connection ${connectionId}:`,
        errorMessage,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  };
}

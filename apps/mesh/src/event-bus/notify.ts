/**
 * Event Bus Notification Module
 *
 * Handles notifying subscriber connections of events using the MCP proxy
 * and the Event Receiver binding.
 */

import { ContextFactory } from "@/core/context-factory";
import { EventSubscriberBinding } from "@decocms/bindings";
import { dangerouslyCreateSuperUserMCPProxy } from "../api/routes/proxy";
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
export function createNotifySubscriber(): NotifySubscriberFn {
  return async (connectionId, events) => {
    try {
      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "notify.ts:24",
            message: "createProxy START",
            data: { connectionId, eventCount: events.length },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "E",
          }),
        },
      ).catch(() => {});
      // #endregion

      // Get a system context for the notification
      const ctx = await ContextFactory.create();

      // Create MCP proxy for the subscriber connection
      const proxy = await dangerouslyCreateSuperUserMCPProxy(connectionId, {
        ...ctx,
        auth: { ...ctx.auth, user: { id: "notify-worker" } },
      });

      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/8397b2ea-9df9-487e-9ffa-b17eb1bfd701",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "notify.ts:37",
            message: "createProxy SUCCESS, calling ON_EVENTS",
            data: { connectionId },
            timestamp: Date.now(),
            sessionId: "debug-session",
            hypothesisId: "E",
          }),
        },
      ).catch(() => {});
      // #endregion

      // Use the Event Subscriber binding - pass the whole proxy object
      // Same pattern as LanguageModelBinding.forClient(proxy) in models.ts
      const client = EventSubscriberBinding.forClient(proxy);

      // Call ON_EVENTS with the batch of events
      const result = await client.ON_EVENTS({ events });

      return {
        success: result.success,
        error: result.error,
        retryAfter: result.retryAfter,
        results: result.results,
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

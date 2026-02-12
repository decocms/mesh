/**
 * Workflows Plugin - Server Entry Point
 *
 * Provides workflow management and execution tools.
 * Tools have access to the mesh database (via Kysely) and event bus.
 */

import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";
import { migrations } from "./migrations";
import { createStorage, type WorkflowPluginStorage } from "./storage";
import { tools } from "./tools";
import {
  WORKFLOW_EVENTS,
  handleWorkflowEventsFireAndForget,
} from "./events/handler";
import { getPluginStorage, setPluginStorage } from "./types";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,

  // MCP tools (12 total: 5 collection CRUD + 7 execution)
  tools,

  // Database migrations
  migrations,

  // Storage factory - also sets up the plugin storage singleton for tools
  createStorage: (ctx) => {
    const storage = createStorage(ctx);
    setPluginStorage(storage as WorkflowPluginStorage);
    return storage;
  },

  // Event handler - receives workflow events from the event bus
  // The system auto-subscribes the SELF connection to these event types per-org
  onEvents: {
    types: [...WORKFLOW_EVENTS],
    handler: (events, ctx) => {
      const storage = getPluginStorage();

      // Fire-and-forget: handlers run in the background so the event bus
      // worker releases its processing lock immediately. See handler.ts.
      handleWorkflowEventsFireAndForget(events, {
        storage: storage.executions,
        publish: async (type, subject, data, options) => {
          await ctx.publish(type, subject, data, options);
        },
        createMCPProxy: async (connectionId: string) => {
          return ctx.createMCPProxy(connectionId);
        },
      });
    },
  },

  // Startup hook - recover stuck executions from previous crash/restart
  onStartup: async (ctx) => {
    const storage = getPluginStorage();

    const recovered = await storage.executions.recoverStuckExecutions();

    if (recovered.length > 0) {
      console.log(
        `[Workflows] Recovering ${recovered.length} stuck execution(s) from previous shutdown`,
      );

      for (const execution of recovered) {
        try {
          await ctx.publish(execution.organization_id, {
            type: "workflow.execution.resumed",
            subject: execution.id,
          });
        } catch (error) {
          console.error(
            `[Workflows] Failed to re-publish execution ${execution.id}:`,
            error,
          );
        }
      }
    }
  },
};

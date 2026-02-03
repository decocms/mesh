/**
 * PROJECT_PLUGIN_CONFIG_UPDATE Tool
 *
 * Update or create plugin configuration for a project
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { serializedPluginConfigSchema } from "./schema";

export const PROJECT_PLUGIN_CONFIG_UPDATE = defineTool({
  name: "PROJECT_PLUGIN_CONFIG_UPDATE" as const,
  description: "Update or create plugin configuration for a project",

  inputSchema: z.object({
    projectId: z.string().describe("Project ID"),
    pluginId: z.string().describe("Plugin ID"),
    connectionId: z
      .string()
      .nullable()
      .optional()
      .describe("MCP connection to bind"),
    settings: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .describe("Plugin-specific settings"),
  }),

  outputSchema: z.object({
    config: serializedPluginConfigSchema,
  }),

  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Check authorization
    await ctx.access.check();

    const { projectId, pluginId, connectionId, settings } = input;

    const config = await ctx.storage.projectPluginConfigs.upsert(
      projectId,
      pluginId,
      {
        connectionId,
        settings,
      },
    );

    return {
      config: {
        id: config.id,
        projectId: config.projectId,
        pluginId: config.pluginId,
        connectionId: config.connectionId,
        settings: config.settings,
        createdAt:
          config.createdAt instanceof Date
            ? config.createdAt.toISOString()
            : config.createdAt,
        updatedAt:
          config.updatedAt instanceof Date
            ? config.updatedAt.toISOString()
            : config.updatedAt,
      },
    };
  },
});

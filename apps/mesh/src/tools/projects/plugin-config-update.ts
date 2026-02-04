/**
 * PROJECT_PLUGIN_CONFIG_UPDATE Tool
 *
 * Update or create plugin configuration for a project
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { getUserId, requireAuth } from "../../core/mesh-context";
import { serializedPluginConfigSchema } from "./schema";
import {
  createDevAssetsConnectionEntity,
  isDevAssetsConnection,
  isDevMode,
} from "../connection/dev-assets";
import { getBaseUrl } from "../../core/server-constants";
import { WellKnownOrgMCPId } from "@decocms/mesh-sdk";

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
    const userId = getUserId(ctx);

    const projectRow = await ctx.db
      .selectFrom("projects")
      .select(["id", "organization_id"])
      .where("id", "=", projectId)
      .executeTakeFirst();
    const connectionExists = connectionId
      ? await ctx.db
          .selectFrom("connections")
          .select(["id"])
          .where("id", "=", connectionId)
          .executeTakeFirst()
      : null;

    if (
      connectionId &&
      projectRow?.organization_id &&
      !connectionExists &&
      isDevMode()
    ) {
      const devAssetsId = WellKnownOrgMCPId.DEV_ASSETS(
        projectRow.organization_id,
      );
      if (isDevAssetsConnection(connectionId, projectRow.organization_id)) {
        if (!userId) {
          throw new Error("User ID required to create dev-assets connection");
        }
        const devAssetsConnection = createDevAssetsConnectionEntity(
          projectRow.organization_id,
          getBaseUrl(),
        );
        await ctx.storage.connections.create({
          ...devAssetsConnection,
          organization_id: projectRow.organization_id,
          created_by: userId,
        });
      }
    }

    const config = await ctx.storage.projectPluginConfigs.upsert(
      projectId,
      pluginId,
      {
        connectionId,
        settings,
      },
    );

    logDebug({
      runId: "debug",
      hypothesisId: "H4",
      location: "plugin-config-update.ts:93",
      message: "PROJECT_PLUGIN_CONFIG_UPDATE success",
      data: {
        configId: config.id,
        configProjectId: config.projectId,
        configConnectionId: config.connectionId,
      },
    });

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

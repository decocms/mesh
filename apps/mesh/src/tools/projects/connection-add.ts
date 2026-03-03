/**
 * PROJECT_CONNECTION_ADD Tool
 *
 * Associate a connection with a project
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

export const PROJECT_CONNECTION_ADD = defineTool({
  name: "PROJECT_CONNECTION_ADD" as const,
  description: "Associate a connection with a project",
  annotations: {
    title: "Add Project Connection",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({
    projectId: z.string().describe("Project ID"),
    connectionId: z.string().describe("Connection ID to associate"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    projectConnectionId: z.string(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    const { projectId, connectionId } = input;

    // Validate project exists
    const project = await ctx.storage.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Validate connection exists and belongs to the same org
    const connection = await ctx.storage.connections.findById(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    if (connection.organization_id !== project.organizationId) {
      throw new Error("Connection does not belong to the same organization");
    }

    const pc = await ctx.storage.projectConnections.add(
      projectId,
      connectionId,
    );

    return {
      success: true,
      projectConnectionId: pc.id,
    };
  },
});

/**
 * PROJECT_LIST Tool
 *
 * List all projects in an organization
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { serializedProjectSchema } from "./schema";

export const PROJECT_LIST = defineTool({
  name: "PROJECT_LIST" as const,
  description: "List all projects in an organization",

  inputSchema: z.object({
    organizationId: z.string().describe("Organization ID to list projects for"),
  }),

  outputSchema: z.object({
    projects: z.array(serializedProjectSchema.omit({ organizationId: true })),
  }),

  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Check authorization
    await ctx.access.check();

    const projects = await ctx.storage.projects.list(input.organizationId);

    return {
      projects: projects.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        enabledPlugins: project.enabledPlugins,
        ui: project.ui,
        createdAt:
          project.createdAt instanceof Date
            ? project.createdAt.toISOString()
            : project.createdAt,
        updatedAt:
          project.updatedAt instanceof Date
            ? project.updatedAt.toISOString()
            : project.updatedAt,
      })),
    };
  },
});

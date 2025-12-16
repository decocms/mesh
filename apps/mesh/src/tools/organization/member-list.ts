/**
 * ORGANIZATION_MEMBER_LIST Tool
 *
 * List all members in an organization
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

export const ORGANIZATION_MEMBER_LIST = defineTool({
  name: "ORGANIZATION_MEMBER_LIST",
  description: "List all members in an organization",

  inputSchema: z.object({
    limit: z.number().optional(),
    offset: z.number().optional(),
  }),

  outputSchema: z.object({
    members: z.array(
      z.object({
        id: z.string(),
        organizationId: z.string(),
        userId: z.string(),
        role: z.string(),
        createdAt: z.union([z.date(), z.string()]),
        user: z
          .object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            image: z.string().optional(),
          })
          .optional(),
      }),
    ),
  }),

  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Check authorization
    await ctx.access.check();
    // Use active organization if not specified
    const organizationId = ctx.organization?.id;
    if (!organizationId) {
      throw new Error(
        "Organization ID required (no active organization in context)",
      );
    }

    // List members via Better Auth
    const result = await ctx.boundAuth.organization.listMembers({
      organizationId,
      limit: input.limit,
      offset: input.offset,
    });

    return {
      members: Array.isArray(result) ? result : [],
    };
  },
});

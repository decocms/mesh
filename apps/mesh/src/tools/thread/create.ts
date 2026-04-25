/**
 * COLLECTION_THREADS_CREATE Tool
 *
 * Create a new thread for a virtual MCP. Branch is server-derived from the
 * vMCP's githubRepo metadata. Idempotent on `id` collisions.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ThreadCreateDataSchema, ThreadEntitySchema } from "./schema";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { generateBranchName } from "./branch-name";

const CreateInputSchema = z.object({
  data: ThreadCreateDataSchema.describe(
    "Data for the new thread (id is auto-generated if not provided)",
  ),
});

export type CreateThreadInput = z.infer<typeof CreateInputSchema>;

const CreateOutputSchema = z.object({
  item: ThreadEntitySchema.describe("The created thread entity"),
});

type GithubRepoMeta = {
  githubRepo?: {
    owner: string;
    name: string;
    connectionId?: string;
  } | null;
};

export const COLLECTION_THREADS_CREATE = defineTool({
  name: "COLLECTION_THREADS_CREATE",
  description: "Create a new thread for organizing messages and conversations.",
  annotations: {
    title: "Create Thread",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create thread");
    }

    const { data } = input;
    const taskId = data.id ?? generatePrefixedId("thrd");

    const vmcp = await ctx.storage.virtualMcps.findById(
      data.virtual_mcp_id,
      organization.id,
    );
    if (!vmcp) {
      throw new Error(`Virtual MCP not found: ${data.virtual_mcp_id}`);
    }

    const githubRepo = (vmcp.metadata as GithubRepoMeta | null | undefined)
      ?.githubRepo;
    const branch = githubRepo ? generateBranchName() : null;

    const result = await ctx.storage.threads.create({
      id: taskId,
      organization_id: organization.id,
      title: data.title,
      description: data.description,
      virtual_mcp_id: data.virtual_mcp_id,
      branch,
      created_by: userId,
    });

    return {
      item: {
        ...result,
        hidden: result.hidden ?? false,
      },
    };
  },
});

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { createFreestyleClient } from "../../freestyle/client";
import { setupRepo, cleanupFreestyleResources } from "../../freestyle/setup";
import { REPO_URL_PATTERN } from "../../freestyle/types";

const InputSchema = z.object({
  virtual_mcp_id: z.string().describe("ID of the virtual MCP"),
  repo_url: z
    .string()
    .regex(REPO_URL_PATTERN, 'Must be in "owner/repo" format')
    .describe("GitHub repository in owner/repo format"),
});

const OutputSchema = z.object({
  success: z.boolean(),
  runtime: z.string(),
  scripts: z.record(z.string(), z.string()),
});

export const VIRTUAL_MCP_ADD_REPO = defineTool({
  name: "VIRTUAL_MCP_ADD_REPO",
  description:
    "Link a GitHub repository to a Virtual MCP. Detects runtime, installs dependencies, and creates a snapshot.",
  annotations: {
    title: "Add Repository",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    if (!ctx.freestyleApiKey) {
      throw new Error(
        "FREESTYLE_API_KEY is not configured. Set the environment variable to enable repository linking.",
      );
    }

    const existing = await ctx.storage.virtualMcps.findById(
      input.virtual_mcp_id,
    );
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error(`Virtual MCP not found: ${input.virtual_mcp_id}`);
    }

    // Set installing status
    await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
      metadata: {
        ...existing.metadata,
        repo_url: input.repo_url,
        runtime_status: "installing",
      },
    });

    const freestyle = createFreestyleClient(ctx.freestyleApiKey);

    try {
      // Clean up any existing Freestyle resources
      await cleanupFreestyleResources(
        freestyle,
        existing.metadata as Record<string, unknown>,
      );

      const result = await setupRepo(freestyle, input.repo_url);

      // Update metadata with all Freestyle IDs and detection results
      await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
        metadata: {
          ...existing.metadata,
          repo_url: input.repo_url,
          freestyle_repo_id: result.repoId,
          freestyle_vm_id: result.vmId,
          freestyle_snapshot_id: result.snapshotId,
          runtime: result.runtime,
          runtime_status: "idle",
          scripts: result.scripts,
          instructions: result.instructions ?? existing.metadata?.instructions,
          autorun: result.autorun,
          preview_port: result.preview_port,
        },
      });

      return {
        success: true,
        runtime: result.runtime,
        scripts: result.scripts,
      };
    } catch (error) {
      // Reset status on failure
      await ctx.storage.virtualMcps
        .update(input.virtual_mcp_id, userId, {
          metadata: {
            ...existing.metadata,
            repo_url: input.repo_url,
            runtime_status: "idle",
          },
        })
        .catch(() => {});

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add repo "${input.repo_url}": ${message}`);
    }
  },
});

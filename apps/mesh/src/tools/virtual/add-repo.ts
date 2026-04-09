import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { createFreestyleClient } from "../../freestyle/client";
import { setupRepo, cleanupFreestyleResources } from "../../freestyle/setup";
import { detectRepo, GitHubFileReader } from "../../freestyle/detect";
import { REPO_URL_PATTERN, validateRepoUrl } from "../../freestyle/types";

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

    // Step 1: Detect repo (scripts, runtime, instructions) — always save results
    const validated = validateRepoUrl(input.repo_url);
    console.log("[add-repo] Starting detection for:", validated);
    let detection: Awaited<ReturnType<typeof detectRepo>>;
    try {
      detection = await detectRepo(validated, new GitHubFileReader());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[add-repo] Detection failed:", message);
      throw new Error(`Failed to detect repo "${input.repo_url}": ${message}`);
    }

    console.log("[add-repo] Detection result:", {
      runtime: detection.runtime,
      scripts: detection.scripts,
      scriptCount: Object.keys(detection.scripts).length,
      instructions: detection.instructions
        ? `${detection.instructions.length} chars`
        : null,
      autorun: detection.autorun,
      preview_port: detection.preview_port,
    });

    // Save detection results immediately (scripts, runtime, etc.)
    await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
      metadata: {
        ...existing.metadata,
        repo_url: input.repo_url,
        runtime: detection.runtime,
        runtime_status: "installing",
        scripts: detection.scripts,
        instructions: detection.instructions ?? existing.metadata?.instructions,
        autorun: detection.autorun,
        preview_port: detection.preview_port,
      },
    });

    // Step 2: Freestyle infra setup (VM, snapshot) — optional, may fail
    if (!ctx.freestyleApiKey) {
      // No Freestyle key — detection results saved, but no VM
      await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
        metadata: {
          ...existing.metadata,
          repo_url: input.repo_url,
          runtime: detection.runtime,
          runtime_status: "idle",
          scripts: detection.scripts,
          instructions:
            detection.instructions ?? existing.metadata?.instructions,
          autorun: detection.autorun,
          preview_port: detection.preview_port,
        },
      });

      return {
        success: true,
        runtime: detection.runtime,
        scripts: detection.scripts,
      };
    }

    const freestyle = createFreestyleClient(ctx.freestyleApiKey);

    try {
      // Clean up any existing Freestyle resources
      await cleanupFreestyleResources(
        freestyle,
        existing.metadata as Record<string, unknown>,
      );

      const result = await setupRepo(freestyle, input.repo_url);

      // Update metadata with Freestyle IDs
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
      // Freestyle failed but detection results are preserved
      await ctx.storage.virtualMcps
        .update(input.virtual_mcp_id, userId, {
          metadata: {
            ...existing.metadata,
            repo_url: input.repo_url,
            runtime: detection.runtime,
            runtime_status: "idle",
            scripts: detection.scripts,
            instructions:
              detection.instructions ?? existing.metadata?.instructions,
            autorun: detection.autorun,
            preview_port: detection.preview_port,
          },
        })
        .catch(() => {});

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add repo "${input.repo_url}": ${message}`);
    }
  },
});

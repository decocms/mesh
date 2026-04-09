import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { createFreestyleClient } from "../../freestyle/client";
import { runScript } from "../../freestyle/runtime";

const InputSchema = z.object({
  virtual_mcp_id: z.string().describe("ID of the virtual MCP"),
  script: z.string().describe("Script name from package.json to run"),
});

const OutputSchema = z.object({
  success: z.boolean(),
  vm_domain: z.string().nullable(),
});

export const VIRTUAL_MCP_RUN_SCRIPT = defineTool({
  name: "VIRTUAL_MCP_RUN_SCRIPT",
  description: "Start a script from the linked repository on a Freestyle VM.",
  annotations: {
    title: "Run Script",
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
      throw new Error("FREESTYLE_API_KEY is not configured.");
    }

    const existing = await ctx.storage.virtualMcps.findById(
      input.virtual_mcp_id,
    );
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error(`Virtual MCP not found: ${input.virtual_mcp_id}`);
    }

    const metadata = existing.metadata as Record<string, unknown>;

    // Allow running if idle, or if stale "running" state with no VM domain
    const isStaleRunning =
      metadata.runtime_status === "running" && !metadata.vm_domain;
    if (
      metadata.runtime_status !== "idle" &&
      metadata.runtime_status !== null &&
      metadata.runtime_status !== undefined &&
      !isStaleRunning
    ) {
      throw new Error(
        `Cannot start script: current status is "${metadata.runtime_status}". Stop the running script first.`,
      );
    }

    // Optimistic lock: set to running before creating VM
    await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
      metadata: {
        ...existing.metadata,
        runtime_status: "running",
        running_script: input.script,
      },
    });

    const freestyle = createFreestyleClient(ctx.freestyleApiKey);

    try {
      const result = await runScript(freestyle, metadata, input.script);

      await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
        metadata: {
          ...existing.metadata,
          runtime_status: "running",
          running_script: input.script,
          freestyle_vm_id: result.vmId,
          vm_domain: result.domain,
        },
      });

      return {
        success: true,
        vm_domain: result.domain,
      };
    } catch (error) {
      // Reset on failure
      await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
        metadata: {
          ...existing.metadata,
          runtime_status: "idle",
          running_script: null,
          vm_domain: null,
        },
      });
      throw error;
    }
  },
});

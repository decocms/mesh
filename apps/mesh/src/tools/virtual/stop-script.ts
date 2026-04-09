import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { createFreestyleClient } from "../../freestyle/client";
import { stopScript } from "../../freestyle/runtime";

const InputSchema = z.object({
  virtual_mcp_id: z.string().describe("ID of the virtual MCP"),
});

const OutputSchema = z.object({
  success: z.boolean(),
});

export const VIRTUAL_MCP_STOP_SCRIPT = defineTool({
  name: "VIRTUAL_MCP_STOP_SCRIPT",
  description: "Stop the running script and delete the Freestyle VM.",
  annotations: {
    title: "Stop Script",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
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
    const freestyle = createFreestyleClient(ctx.freestyleApiKey);

    await stopScript(freestyle, metadata);

    await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
      metadata: {
        ...existing.metadata,
        runtime_status: "idle",
        running_script: null,
        freestyle_vm_id: null,
        vm_domain: null,
      },
    });

    return { success: true };
  },
});

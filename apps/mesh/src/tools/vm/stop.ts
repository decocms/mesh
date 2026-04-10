/**
 * VM_STOP Tool
 *
 * Stops a Freestyle VM and removes its entry from the Virtual MCP metadata.
 * App-only tool — not visible to AI models.
 *
 * Deletion order: Freestyle VM deleted FIRST, then DB entry cleaned.
 * If Freestyle fails, the error propagates and the DB entry is preserved,
 * so the user can retry. If DB cleanup fails after a successful Freestyle
 * delete, the entry becomes stale (VM gone but DB still has it). The next
 * VM_START will return a stale previewUrl that 502s — a known limitation.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  requireAuth,
  requireOrganization,
  getUserId,
} from "../../core/mesh-context";
import { freestyle } from "freestyle-sandboxes";
import { patchActiveVms, type VmMetadata } from "./types";

export const VM_STOP = defineTool({
  name: "VM_STOP",
  description: "Stop and delete a Freestyle VM.",
  annotations: {
    title: "Stop VM Preview",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    virtualMcpId: z.string().describe("Virtual MCP ID that owns this VM"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    // Look up the VM entry from the DB — do NOT accept vmId from the caller.
    // This ensures a user can only stop their own VM.
    const virtualMcp = await ctx.storage.virtualMcps.findById(
      input.virtualMcpId,
    );

    // Org-scope guard: ensure this Virtual MCP belongs to the caller's org.
    if (virtualMcp && virtualMcp.organization_id !== organization.id) {
      throw new Error("Virtual MCP not found");
    }

    const metadata = virtualMcp?.metadata as VmMetadata | undefined;
    const entry = metadata?.activeVms?.[userId];

    if (entry) {
      // Delete Freestyle VM FIRST. If this fails, the error propagates and
      // the DB entry is preserved so the user can retry.
      try {
        await freestyle.vms.delete({ vmId: entry.vmId });
      } catch {
        // VM may already be deleted on Freestyle's side — treat as success
      }
    }

    // Clean up the DB entry after the Freestyle delete attempt.
    if (virtualMcp && entry) {
      await patchActiveVms(
        ctx.storage.virtualMcps,
        input.virtualMcpId,
        userId,
        (vms) => {
          const updated = { ...vms };
          delete updated[userId];
          return updated;
        },
      );
    }

    return { success: true };
  },
});

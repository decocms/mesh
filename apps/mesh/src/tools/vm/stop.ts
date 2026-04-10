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
import { freestyle } from "freestyle-sandboxes";
import { patchActiveVms } from "./types";
import { requireVmEntry } from "./helpers";

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
    let vmEntry: Awaited<ReturnType<typeof requireVmEntry>>;
    try {
      vmEntry = await requireVmEntry(input, ctx);
    } catch (err) {
      if (err instanceof Error && err.message === "Virtual MCP not found") {
        return { success: true };
      }
      throw err;
    }
    const { entry, userId } = vmEntry;

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
    if (entry) {
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

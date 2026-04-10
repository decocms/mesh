/**
 * VM_STOP Tool
 *
 * Stops a Freestyle VM and removes its entry from the Virtual MCP metadata.
 * App-only tool — not visible to AI models.
 *
 * Uses vm.stop() for graceful shutdown (preserves disk on Freestyle's side).
 * Clears the DB entry so the UI returns to idle state.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { patchActiveVms } from "./types";
import { requireVmEntry } from "./helpers";

export const VM_STOP = defineTool({
  name: "VM_STOP",
  description: "Stop a Freestyle VM.",
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
      try {
        const vm = freestyle.vms.ref({ vmId: entry.vmId });
        await vm.stop();
      } catch {
        // VM may already be stopped/deleted — treat as success
      }
    }

    // Clear the DB entry so the UI returns to idle state.
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

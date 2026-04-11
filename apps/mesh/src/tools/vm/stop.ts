/**
 * VM_DELETE Tool
 *
 * Deletes a Freestyle VM and removes its entry from the Virtual MCP metadata.
 * App-only tool — not visible to AI models.
 *
 * Uses vm.delete() to fully destroy the VM so the next VM_START creates a
 * fresh instance with updated systemd config and infrastructure.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { patchActiveVms } from "./types";
import { requireVmEntry } from "./helpers";

export const VM_DELETE = defineTool({
  name: "VM_DELETE",
  description: "Delete a Freestyle VM.",
  annotations: {
    title: "Delete VM Preview",
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

    // Clear the DB entry first so the UI returns to idle immediately.
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

    if (entry) {
      const vm = freestyle.vms.ref({ vmId: entry.vmId });
      await Promise.race([
        vm.delete(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("vm.delete() timed out")), 10_000),
        ),
      ]).catch((err) =>
        console.error(`[VM_DELETE] ${entry.vmId}: ${err.message}`),
      );
    }

    return { success: true };
  },
});

/**
 * VM_STOP Tool
 *
 * Deletes a Freestyle VM.
 * App-only tool — not visible to AI models.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { freestyle } from "freestyle-sandboxes";
import { removeActiveVm } from "./registry";

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
    vmId: z.string().describe("Freestyle VM ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();

    removeActiveVm(input.vmId);

    try {
      await freestyle.vms.delete({ vmId: input.vmId });
    } catch {
      // VM may already be deleted
    }

    return { success: true };
  },
});

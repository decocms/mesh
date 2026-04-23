/**
 * VM_DELETE Tool
 *
 * Deletes a sandbox keyed by (userId, branch) and removes its entry from
 * `vmMap[userId][branch]`. App-only tool — not visible to AI models.
 *
 * Dispatches on the entry's `runnerKind` (persisted at VM_START time) so a
 * pod that flips `MESH_SANDBOX_RUNNER` between start and stop still tears
 * down the right kind of VM.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import { requireVmEntry } from "./helpers";
import { getSharedRunner } from "../../sandbox/lifecycle";
import { removeVmMapEntry } from "./vm-map";

export const VM_DELETE = defineTool({
  name: "VM_DELETE",
  description: "Delete a sandbox.",
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
    branch: z
      .string()
      .min(1)
      .describe("Branch whose vm should be deleted (vmMap[userId][branch])"),
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

    if (!entry) {
      return { success: true };
    }

    // Clear the vmMap entry first so the UI returns to idle immediately,
    // regardless of whether the teardown below succeeds.
    await removeVmMapEntry(
      ctx.storage.virtualMcps,
      input.virtualMcpId,
      userId,
      userId,
      input.branch,
    );

    if (entry.runnerKind === "docker") {
      const runner = getSharedRunner(ctx);
      if (runner instanceof DockerSandboxRunner) {
        // Graceful: give the dev server a SIGTERM window before the
        // container teardown forcibly kills everything.
        await runner
          .proxyDaemonRequest(entry.vmId, "/_daemon/dev/stop", {
            method: "POST",
            headers: new Headers(),
            body: null,
          })
          .catch(() => {});
      }
      await runner
        .delete(entry.vmId)
        .catch((err) =>
          console.error(
            `[VM_DELETE] docker ${entry.vmId}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    } else {
      // Freestyle path — also the fallback for legacy entries that pre-date
      // `runnerKind` being stored on the vmMap entry.
      const vm = freestyle.vms.ref({ vmId: entry.vmId });
      await Promise.race([
        vm.stop().then(() => vm.delete()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("vm.delete() timed out")), 10_000),
        ),
      ]).catch((err) =>
        console.error(
          `[VM_DELETE] freestyle ${entry.vmId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    return { success: true };
  },
});

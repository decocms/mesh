/**
 * VM_DELETE Tool
 *
 * Deletes the sandbox for the current user and removes the
 * `activeVms[userId]` entry from the Virtual MCP metadata. App-only tool —
 * not visible to AI models.
 *
 * Dispatches on `MESH_SANDBOX_RUNNER` the same way `VM_START` does:
 *  - "freestyle" → vm.stop() + vm.delete() so the next VM_START re-creates
 *    the VM with fresh systemd config.
 *  - "docker" → runner.delete(handle) to stop and discard the container.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import { patchActiveVms } from "./types";
import { requireVmEntry } from "./helpers";
import { getSharedRunner } from "../../sandbox/shared-runner";

function resolveRunnerKind(): "docker" | "freestyle" {
  const raw = process.env.MESH_SANDBOX_RUNNER;
  if (raw === "docker" || raw === "freestyle") return raw;
  return "freestyle";
}

export const VM_DELETE = defineTool({
  name: "VM_DELETE",
  description:
    "Delete a sandbox. For the Docker runner the sandbox is resolved by the thread's sandbox_ref; if multiple threads share the same sandbox_ref (future explicit-share feature), deleting from one thread tears it down for all of them.",
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
    threadId: z
      .string()
      .optional()
      .describe(
        "Current thread id. Required for the Docker runner — used to resolve the sandbox via thread.sandbox_ref.",
      ),
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
    // (activeVms still backs the Freestyle path and is a best-effort cache
    // for the env panel on the Docker path.)
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

    if (resolveRunnerKind() === "docker") {
      // Resolve the handle through thread.sandbox_ref so a delete hits the
      // same container bash is using, regardless of which thread's activeVms
      // last won the last-write race.
      if (!input.threadId) {
        throw new Error(
          "VM_DELETE (docker runner): threadId is required — pass the current thread id so we can resolve the sandbox via thread.sandbox_ref",
        );
      }
      const thread = await ctx.storage.threads.get(input.threadId);
      const sandboxRef = thread?.sandbox_ref ?? null;
      if (sandboxRef) {
        const row = await ctx.db
          .selectFrom("sandbox_runner_state")
          .select(["handle"])
          .where("user_id", "=", userId)
          .where("project_ref", "=", sandboxRef)
          .where("runner_kind", "=", "docker")
          .executeTakeFirst();
        if (row) {
          const runner = getSharedRunner(ctx);
          // Graceful: stop the dev process so it gets a SIGTERM window before
          // the container teardown forcibly kills everything.
          if (runner instanceof DockerSandboxRunner) {
            await runner
              .proxyDaemonRequest(row.handle, "/dev/stop", {
                method: "POST",
                headers: new Headers(),
                body: null,
              })
              .catch(() => {});
          }
          await runner
            .delete(row.handle)
            .catch((err) =>
              console.error(
                `[VM_DELETE] docker ${row.handle}: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
      }
    } else if (entry) {
      const vm = freestyle.vms.ref({ vmId: entry.vmId });
      await Promise.race([
        vm.stop().then(() => vm.delete()),
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

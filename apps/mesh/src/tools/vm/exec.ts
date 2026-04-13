import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";

export const VM_EXEC = defineTool({
  name: "VM_EXEC",
  description: "Execute install or dev commands inside a running VM.",
  annotations: {
    title: "Execute VM Command",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    virtualMcpId: z.string().describe("Virtual MCP ID"),
    action: z.enum(["install", "dev"]).describe("Action to execute"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  handler: async (input, ctx) => {
    const { entry, metadata } = await requireVmEntry(input, ctx);
    if (!entry) {
      throw new Error("No active VM found. Start a VM first.");
    }

    const vm = freestyle.vms.ref({ vmId: entry.vmId });
    const { installScript, devScript, port, runtimeBinPath } =
      resolveRuntimeConfig(metadata);
    const pathPrefix = runtimeBinPath
      ? `export PATH=${runtimeBinPath}:$PATH && `
      : "";

    try {
      if (input.action === "install") {
        // Build the full install script that runs in the background.
        // All output goes to /tmp/install.log so the daemon streams it over SSE.
        // Runtime (node/deno/bun) is pre-installed via Freestyle integrations.
        // No manual curl installs needed.
        const steps: string[] = [
          // Wait for git repo to be synced (oneshot services become "inactive" on
          // success, so is-active returns exit 3 — treat that as OK).
          "systemctl is-active --wait freestyle-git-sync.service > /dev/null 2>&1 || [ $? -eq 3 ]",
          `${pathPrefix}echo "$ ${installScript}" && cd /app && ${installScript}`,
        ];

        const script = steps.join(" && ");

        // Fire and forget — output streams to /tmp/vm.log via ttyd.
        // Don't await: vm.exec() blocks until all child processes exit.
        vm.exec({
          command: `nohup bash -c '(${script}) >> /tmp/install.log 2>&1 &'`,
        }).catch(console.error);

        return { success: true };
      }

      // action === "dev"
      // Kill old dev server and start a new one. Fire-and-forget to avoid
      // blocking — vm.exec() waits for all child processes to exit.
      // iframe-proxy is managed by its systemd service, no manual start needed.
      vm.exec({
        command: `nohup bash -c 'kill $(cat /tmp/dev.pid) 2>/dev/null || true; ${pathPrefix}echo "$ ${devScript}" >> /tmp/dev.log && cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${port} ${devScript} >> /tmp/dev.log 2>&1 & echo $! > /tmp/dev.pid'`,
      }).catch(console.error);

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Command execution failed";
      return { success: false, error: message };
    }
  },
});

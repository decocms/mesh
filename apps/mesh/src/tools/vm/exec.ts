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
        // All output goes to /tmp/vm.log so the ttyd terminal shows progress.
        // Runtime (node/deno/bun) is pre-installed via Freestyle integrations.
        // No manual curl installs needed.
        const steps: string[] = [
          'echo "" && echo "--- Reinstalling dependencies ---"',
          // Wait for git repo to be synced
          "systemctl is-active --wait freestyle-git-sync.service",
          `${pathPrefix}echo "$ ${installScript}" && cd /app && ${installScript}`,
        ];

        const script = steps.join(" && ");

        // Fire and forget — output streams to /tmp/vm.log via ttyd
        await vm.exec({
          command: `nohup bash -c '(${script}) >> /tmp/vm.log 2>&1 &'`,
        });

        return { success: true };
      }

      // action === "dev"
      // Kill existing dev server via PID file
      await vm.exec("kill $(cat /tmp/dev.pid) 2>/dev/null || true");

      // Start dev server with nohup so it survives shell exit
      await vm.exec({
        command: `nohup bash -c '${pathPrefix}echo "" >> /tmp/vm.log && echo "--- Starting dev server ---" >> /tmp/vm.log && cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${port} ${devScript} >> /tmp/vm.log 2>&1 & echo $! > /tmp/dev.pid'`,
      });

      // Start iframe-proxy if not already running
      await vm.exec(
        "pgrep -f iframe-proxy || nohup /usr/local/bin/node /opt/iframe-proxy.js >> /tmp/vm.log 2>&1 &",
      );

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Command execution failed";
      return { success: false, error: message };
    }
  },
});

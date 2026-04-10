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
    const { installScript, devScript, detected, port, needsRuntimeInstall } =
      resolveRuntimeConfig(metadata);

    try {
      if (input.action === "install") {
        // Truncate log for fresh output
        await vm.exec("> /tmp/vm.log");

        // Wait for git repo to be synced
        await vm.exec({
          command: "systemctl is-active --wait freestyle-git-sync.service",
          timeoutMs: 120_000,
        });

        // Install runtime if needed (deno/bun)
        if (needsRuntimeInstall) {
          const setupScript =
            detected === "deno"
              ? 'export DENO_INSTALL="/usr/local" && curl -fsSL https://deno.land/install.sh | sh'
              : 'export BUN_INSTALL="/usr/local" && curl -fsSL https://bun.sh/install | bash';
          await vm.exec({
            command: `echo "Installing ${detected} runtime..." >> /tmp/vm.log && ${setupScript} >> /tmp/vm.log 2>&1`,
            timeoutMs: 120_000,
          });
        }

        // Run install
        await vm.exec({
          command: `echo "$ ${installScript}" >> /tmp/vm.log && cd /app && ${installScript} >> /tmp/vm.log 2>&1`,
          timeoutMs: 600_000,
        });

        return { success: true };
      }

      // action === "dev"
      // Truncate log for fresh output
      await vm.exec("> /tmp/vm.log");

      // Kill existing dev server via PID file
      await vm.exec("kill $(cat /tmp/dev.pid) 2>/dev/null || true");

      // Start dev server with nohup so it survives shell exit
      await vm.exec({
        command: `nohup bash -c 'cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${port} ${devScript} >> /tmp/vm.log 2>&1 & echo $! > /tmp/dev.pid'`,
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

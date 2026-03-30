import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorRunCancelInputSchema,
  RegistryMonitorRunCancelOutputSchema,
} from "./monitor-schemas";
import { cancelMonitorRun } from "./monitor-run-start";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_RUN_CANCEL: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_RUN_CANCEL",
  description: "Cancel a running MCP registry monitor run",
  inputSchema: RegistryMonitorRunCancelInputSchema,
  outputSchema: RegistryMonitorRunCancelOutputSchema,
  handler: orgHandler(
    RegistryMonitorRunCancelInputSchema,
    async (typedInput, ctx) => {
      cancelMonitorRun(typedInput.runId);
      const storage = getPluginStorage();
      const run = await storage.monitorRuns.update(
        ctx.organization.id,
        typedInput.runId,
        {
          status: "cancelled",
          current_item_id: null,
          finished_at: new Date().toISOString(),
        },
      );
      return { run };
    },
  ),
};

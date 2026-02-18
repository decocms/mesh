import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorRunGetInputSchema,
  RegistryMonitorRunGetOutputSchema,
} from "./monitor-schemas";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_RUN_GET: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_RUN_GET",
  description: "Get details for one MCP registry monitor run",
  inputSchema: RegistryMonitorRunGetInputSchema,
  outputSchema: RegistryMonitorRunGetOutputSchema,
  handler: orgHandler(
    RegistryMonitorRunGetInputSchema,
    async (typedInput, ctx) => {
      const storage = getPluginStorage();
      const run = await storage.monitorRuns.findById(
        ctx.organization.id,
        typedInput.runId,
      );
      return { run };
    },
  ),
};

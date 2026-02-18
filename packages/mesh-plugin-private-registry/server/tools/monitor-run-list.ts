import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorRunListInputSchema,
  RegistryMonitorRunListOutputSchema,
} from "./monitor-schemas";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_RUN_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_RUN_LIST",
  description: "List MCP registry monitor runs",
  inputSchema: RegistryMonitorRunListInputSchema,
  outputSchema: RegistryMonitorRunListOutputSchema,
  handler: orgHandler(
    RegistryMonitorRunListInputSchema,
    async (typedInput, ctx) => {
      const storage = getPluginStorage();
      return storage.monitorRuns.list(ctx.organization.id, typedInput);
    },
  ),
};

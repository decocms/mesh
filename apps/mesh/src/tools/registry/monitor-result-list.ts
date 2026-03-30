import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorResultListInputSchema,
  RegistryMonitorResultListOutputSchema,
} from "./monitor-schemas";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_RESULT_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_RESULT_LIST",
  description: "List results for a given MCP registry monitor run",
  inputSchema: RegistryMonitorResultListInputSchema,
  outputSchema: RegistryMonitorResultListOutputSchema,
  handler: orgHandler(
    RegistryMonitorResultListInputSchema,
    async (typedInput, ctx) => {
      const storage = getPluginStorage();
      return storage.monitorResults.listByRun(
        ctx.organization.id,
        typedInput.runId,
        {
          status: typedInput.status,
          limit: typedInput.limit,
          offset: typedInput.offset,
        },
      );
    },
  ),
};

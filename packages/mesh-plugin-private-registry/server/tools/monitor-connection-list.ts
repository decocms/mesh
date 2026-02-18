import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorConnectionListInputSchema,
  RegistryMonitorConnectionListOutputSchema,
} from "./monitor-schemas";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_CONNECTION_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_CONNECTION_LIST",
  description:
    "List monitor connection mappings for private registry MCP monitor runs, including auth status",
  inputSchema: RegistryMonitorConnectionListInputSchema,
  outputSchema: RegistryMonitorConnectionListOutputSchema,
  handler: orgHandler(
    RegistryMonitorConnectionListInputSchema,
    async (_input, ctx) => {
      const storage = getPluginStorage();
      const mappings = await storage.monitorConnections.list(
        ctx.organization.id,
      );
      const items = await Promise.all(
        mappings.map(async (mapping) => {
          const item = await storage.items.findById(
            ctx.organization.id,
            mapping.item_id,
          );
          const remoteUrl =
            item?.server.remotes?.find((r) => r.url)?.url ?? null;
          return {
            mapping,
            item,
            remoteUrl,
          };
        }),
      );
      return { items };
    },
  ),
};

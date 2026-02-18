import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorConnectionSyncInputSchema,
  RegistryMonitorConnectionSyncOutputSchema,
} from "./monitor-schemas";
import { ensureMonitorConnection } from "./monitor-run-start";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_CONNECTION_SYNC: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_CONNECTION_SYNC",
  description:
    "Ensure every registry item has a dedicated monitor connection mapping for MCP monitors",
  inputSchema: RegistryMonitorConnectionSyncInputSchema,
  outputSchema: RegistryMonitorConnectionSyncOutputSchema,
  handler: orgHandler(
    RegistryMonitorConnectionSyncInputSchema,
    async (_input, ctx) => {
      const storage = getPluginStorage();
      const list = await storage.items.list(ctx.organization.id, {});
      const before = await storage.monitorConnections.list(ctx.organization.id);
      const existingByItem = new Set(before.map((m) => m.item_id));

      let created = 0;
      for (const item of list.items) {
        if (!item.server.remotes?.some((r) => r.url)) continue;
        await ensureMonitorConnection(
          ctx as Parameters<typeof ensureMonitorConnection>[0],
          item,
        );
        if (!existingByItem.has(item.id)) created += 1;
      }

      return {
        created,
        updated: Math.max(list.items.length - created, 0),
      };
    },
  ),
};

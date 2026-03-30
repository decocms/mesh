import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryMonitorConnectionUpdateAuthInputSchema,
  RegistryMonitorConnectionUpdateAuthOutputSchema,
} from "./monitor-schemas";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_MONITOR_CONNECTION_UPDATE_AUTH: ServerPluginToolDefinition =
  {
    name: "REGISTRY_MONITOR_CONNECTION_UPDATE_AUTH",
    description:
      "Update the auth_status of a monitor connection mapping (by core connection ID)",
    inputSchema: RegistryMonitorConnectionUpdateAuthInputSchema,
    outputSchema: RegistryMonitorConnectionUpdateAuthOutputSchema,
    handler: orgHandler(
      RegistryMonitorConnectionUpdateAuthInputSchema,
      async ({ connectionId, authStatus }, ctx) => {
        const storage = getPluginStorage();
        const orgId = ctx.organization.id;
        const mapping = await storage.monitorConnections.findByConnectionId(
          orgId,
          connectionId,
        );
        if (!mapping) {
          throw new Error(
            `No monitor connection mapping found for connection ${connectionId}`,
          );
        }

        await storage.monitorConnections.updateAuthStatus(
          orgId,
          mapping.item_id,
          authStatus,
        );

        return { success: true };
      },
    ),
  };

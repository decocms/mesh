import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { WellKnownOrgMCPId } from "@decocms/mesh-sdk";
import {
  RegistryMonitorScheduleCancelInputSchema,
  RegistryMonitorScheduleCancelOutputSchema,
} from "./monitor-schemas";
import { orgHandler } from "./utils";

export const REGISTRY_MONITOR_SCHEDULE_CANCEL: ServerPluginToolDefinition = {
  name: "REGISTRY_MONITOR_SCHEDULE_CANCEL",
  description: "Cancel a recurring MCP monitor schedule via EVENT_CANCEL",
  inputSchema: RegistryMonitorScheduleCancelInputSchema,
  outputSchema: RegistryMonitorScheduleCancelOutputSchema,
  handler: orgHandler(
    RegistryMonitorScheduleCancelInputSchema,
    async (input, ctx) => {
      const selfConnectionId = WellKnownOrgMCPId.SELF(ctx.organization.id);
      const proxy = await ctx.createMCPProxy(selfConnectionId);
      try {
        const result = await proxy.callTool({
          name: "EVENT_CANCEL",
          arguments: { eventId: input.scheduleEventId },
        });
        if (result.isError) {
          throw new Error("Failed to cancel monitor schedule via EVENT_CANCEL");
        }
        return { success: true };
      } finally {
        await proxy.close?.().catch(() => {});
      }
    },
  ),
};

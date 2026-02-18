import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryTestRunCancelInputSchema,
  RegistryTestRunCancelOutputSchema,
} from "./test-schemas";
import { cancelTestRun } from "./test-run-start";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_RUN_CANCEL: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_RUN_CANCEL",
  description: "Cancel a running MCP registry test run",
  inputSchema: RegistryTestRunCancelInputSchema,
  outputSchema: RegistryTestRunCancelOutputSchema,
  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof RegistryTestRunCancelInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    cancelTestRun(typedInput.runId);
    const storage = getPluginStorage();
    const run = await storage.testRuns.update(
      meshCtx.organization.id,
      typedInput.runId,
      {
        status: "cancelled",
        current_item_id: null,
        finished_at: new Date().toISOString(),
      },
    );
    return { run };
  },
};

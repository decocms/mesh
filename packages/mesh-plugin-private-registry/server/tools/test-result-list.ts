import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryTestResultListInputSchema,
  RegistryTestResultListOutputSchema,
} from "./test-schemas";
import { getPluginStorage } from "./utils";

export const REGISTRY_TEST_RESULT_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_TEST_RESULT_LIST",
  description: "List results for a given MCP registry test run",
  inputSchema: RegistryTestResultListInputSchema,
  outputSchema: RegistryTestResultListOutputSchema,
  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof RegistryTestResultListInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    return storage.testResults.listByRun(
      meshCtx.organization.id,
      typedInput.runId,
      {
        status: typedInput.status,
        limit: typedInput.limit,
        offset: typedInput.offset,
      },
    );
  },
};

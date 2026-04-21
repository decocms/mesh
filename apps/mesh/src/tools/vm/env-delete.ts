/**
 * SANDBOX_ENV_DELETE
 *
 * Remove env vars from the current thread's sandbox. Takes effect on next
 * container provision — call VM_DELETE + VM_START to drop them from a
 * running sandbox.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { resolveSandboxRef } from "./env-helpers";

export const SANDBOX_ENV_DELETE = defineTool({
  name: "SANDBOX_ENV_DELETE",
  description:
    "Delete env vars from the current thread's sandbox. Applied on next container provision (VM_DELETE + VM_START to restart).",
  annotations: {
    title: "Delete Sandbox Env Vars",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    threadId: z.string().describe("Thread whose sandbox env is being edited."),
    keys: z.array(z.string()).min(1).describe("Keys to delete."),
  }),
  outputSchema: z.object({
    deleted: z.array(z.string()),
    restartRequired: z.boolean(),
  }),
  handler: async (input, ctx) => {
    const { sandboxRef } = await resolveSandboxRef(input.threadId, ctx);
    for (const key of input.keys) {
      await ctx.storage.sandboxEnv.remove(sandboxRef, key);
    }
    return { deleted: input.keys, restartRequired: true };
  },
});

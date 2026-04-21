/**
 * SANDBOX_ENV_SET
 *
 * Upsert one or more env vars for the current thread's sandbox. Values are
 * encrypted at rest. Changes take effect on the next container provision —
 * call VM_DELETE + VM_START to apply to a running sandbox.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { assertWritableKey, resolveSandboxRef } from "./env-helpers";

export const SANDBOX_ENV_SET = defineTool({
  name: "SANDBOX_ENV_SET",
  description:
    "Store env vars for the current thread's sandbox. Applied on next container provision (VM_DELETE + VM_START to restart).",
  annotations: {
    title: "Set Sandbox Env Vars",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    threadId: z.string().describe("Thread whose sandbox env is being edited."),
    entries: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .min(1)
      .describe("Key/value pairs to upsert."),
  }),
  outputSchema: z.object({
    updated: z.array(z.string()),
    restartRequired: z.boolean(),
  }),
  handler: async (input, ctx) => {
    const { sandboxRef, userId } = await resolveSandboxRef(input.threadId, ctx);
    const updated: string[] = [];
    for (const entry of input.entries) {
      assertWritableKey(entry.key);
      await ctx.storage.sandboxEnv.set(
        sandboxRef,
        userId,
        entry.key,
        entry.value,
      );
      updated.push(entry.key);
    }
    return { updated, restartRequired: true };
  },
});

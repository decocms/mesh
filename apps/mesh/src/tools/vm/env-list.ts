/**
 * SANDBOX_ENV_LIST
 *
 * Returns the keys currently stored for a thread's sandbox. Never returns
 * values — the UI only needs to show which keys exist and when they were
 * last updated.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { resolveSandboxRef } from "./env-helpers";

export const SANDBOX_ENV_LIST = defineTool({
  name: "SANDBOX_ENV_LIST",
  description:
    "List the env var keys stored for the current thread's sandbox. Values are never returned.",
  annotations: {
    title: "List Sandbox Env Keys",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    threadId: z
      .string()
      .describe("Thread whose sandbox env vars should be listed."),
  }),
  outputSchema: z.object({
    keys: z.array(
      z.object({
        key: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  handler: async (input, ctx) => {
    const { sandboxRef } = await resolveSandboxRef(input.threadId, ctx);
    const rows = await ctx.storage.sandboxEnv.listKeys(sandboxRef);
    return {
      keys: rows.map((r) => ({
        key: r.key,
        updatedAt:
          r.updatedAt instanceof Date
            ? r.updatedAt.toISOString()
            : String(r.updatedAt),
      })),
    };
  },
});

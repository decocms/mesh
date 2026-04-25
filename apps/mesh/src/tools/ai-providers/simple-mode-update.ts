import z from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import type { SimpleModeConfig } from "../../storage/types";

const modelSlotSchema = z
  .object({
    keyId: z.string(),
    modelId: z.string(),
    title: z.string().optional(),
  })
  .nullable();

const simpleModeInputSchema = z.object({
  enabled: z.boolean(),
  chat: z.object({
    fast: modelSlotSchema,
    smart: modelSlotSchema,
    thinking: modelSlotSchema,
  }),
  image: modelSlotSchema,
  webResearch: modelSlotSchema,
});

export const AI_SIMPLE_MODE_UPDATE = defineTool({
  name: "AI_SIMPLE_MODE_UPDATE",
  description:
    "Update the Simple Model Mode configuration for the organization. Admin-only.",
  inputSchema: simpleModeInputSchema,
  outputSchema: z.object({ success: z.boolean() }),
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const org = requireOrganization(ctx);
    await ctx.access.check();

    const config: SimpleModeConfig = {
      enabled: input.enabled,
      chat: {
        fast: input.chat.fast,
        smart: input.chat.smart,
        thinking: input.chat.thinking,
      },
      image: input.image,
      webResearch: input.webResearch,
    };

    await ctx.storage.organizationSettings.upsert(org.id, {
      simple_mode: config,
    });

    return { success: true };
  },
});

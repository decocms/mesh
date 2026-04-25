import z from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";

const modelSlotSchema = z
  .object({
    keyId: z.string(),
    modelId: z.string(),
    title: z.string().optional(),
  })
  .nullable();

const simpleModeOutputSchema = z.object({
  enabled: z.boolean(),
  chat: z.object({
    fast: modelSlotSchema,
    smart: modelSlotSchema,
    thinking: modelSlotSchema,
  }),
  image: modelSlotSchema,
  webResearch: modelSlotSchema,
});

export const AI_SIMPLE_MODE_GET = defineTool({
  name: "AI_SIMPLE_MODE_GET",
  description: "Get the Simple Model Mode configuration for the organization.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  inputSchema: z.object({}),
  outputSchema: simpleModeOutputSchema,
  handler: async (_input, ctx) => {
    requireAuth(ctx);
    const org = requireOrganization(ctx);
    await ctx.access.check();

    const settings = await ctx.storage.organizationSettings.get(org.id);
    const cfg = settings?.simple_mode;

    return {
      enabled: cfg?.enabled ?? false,
      chat: {
        fast: cfg?.chat?.fast ?? null,
        smart: cfg?.chat?.smart ?? null,
        thinking: cfg?.chat?.thinking ?? null,
      },
      image: cfg?.image ?? null,
      webResearch: cfg?.webResearch ?? null,
    };
  },
});

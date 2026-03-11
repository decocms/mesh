import z from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";

export const AI_PROVIDERS_LIST_MODELS = defineTool({
  name: "AI_PROVIDERS_LIST_MODELS",
  description:
    "List models available from an AI provider using a specific API key",
  inputSchema: z.object({
    keyId: z.string().describe("The provider key ID to use"),
  }),
  outputSchema: z.object({
    models: z.array(
      z.object({
        modelId: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        logo: z.string().nullable(),
        capabilities: z.array(z.string()),
        limits: z
          .object({
            contextWindow: z.number(),
            maxOutputTokens: z.number(),
          })
          .nullable(),
        costs: z
          .object({
            input: z.number(),
            output: z.number(),
          })
          .nullable(),
      }),
    ),
  }),
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const org = requireOrganization(ctx);
    await ctx.access.check();

    const provider = await ctx.aiProviders.activate(input.keyId, org.id);
    const models = await provider.listModels();
    return { models };
  },
});

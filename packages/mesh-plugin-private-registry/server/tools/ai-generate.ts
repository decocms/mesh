import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryAIGenerateInputSchema,
  RegistryAIGenerateOutputSchema,
} from "./schema";

type MeshToolContext = {
  organization?: { id: string } | null;
  access: { check: () => Promise<void> };
  createMCPProxy: (connectionId: string) => Promise<{
    callTool: (args: {
      name: string;
      arguments?: Record<string, unknown>;
    }) => Promise<{
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    }>;
    close?: () => Promise<void>;
  }>;
};

function normalizeList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  );
}

function extractTextOutput(result: {
  structuredContent?: unknown;
  content?: Array<{ type?: string; text?: string }>;
}): string {
  const structured = result.structuredContent as
    | {
        content?: Array<{ type?: string; text?: string }>;
      }
    | undefined;

  const fromStructured = structured?.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (fromStructured) {
    return fromStructured;
  }

  const fromContent = result.content
    ?.filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  return fromContent ?? "";
}

function buildPrompt(input: z.infer<typeof RegistryAIGenerateInputSchema>): {
  system: string;
  user: string;
  maxOutputTokens: number;
} {
  const ctx = input.context;
  const contextJson = JSON.stringify(
    {
      name: ctx.name ?? "",
      provider: ctx.provider ?? "",
      url: ctx.url ?? "",
      owner: ctx.owner ?? "",
      repositoryUrl: ctx.repositoryUrl ?? "",
      description: ctx.description ?? "",
      shortDescription: ctx.shortDescription ?? "",
      tags: ctx.tags ?? [],
      categories: ctx.categories ?? [],
      availableTags: ctx.availableTags ?? [],
      availableCategories: ctx.availableCategories ?? [],
      tools: ctx.tools ?? [],
    },
    null,
    2,
  );

  if (input.type === "description") {
    return {
      system:
        "You are an assistant that writes concise MCP registry descriptions.",
      user: `Use the context below to write a clear English description for this MCP server.
Rules:
- Maximum 1500 characters
- Explain what the MCP does and typical use cases
- No markdown list, plain text only

Context:
${contextJson}`,
      maxOutputTokens: 600,
    };
  }

  if (input.type === "short_description") {
    return {
      system: "You write short summaries for MCP catalog cards.",
      user: `Use the context below and write ONE short description in English.
Rules:
- Maximum 160 characters
- Plain text only
- Return only the short description

Context:
${contextJson}`,
      maxOutputTokens: 120,
    };
  }

  if (input.type === "tags") {
    return {
      system: "You suggest tags for MCP catalog entries.",
      user: `Use the context below and suggest 3 to 5 tags in English, lowercase.
Rules:
- Return only a comma-separated list
- Prefer existing tags when relevant
- Avoid duplicates
Available tags: ${(ctx.availableTags ?? []).join(", ")}

Context:
${contextJson}`,
      maxOutputTokens: 120,
    };
  }

  if (input.type === "categories") {
    return {
      system: "You suggest the best category for MCP catalog entries.",
      user: `Use the context below and return the best category in English.
Rules:
- Prefer one of the available categories when possible
- Return only one category in lowercase
Available categories: ${(ctx.availableCategories ?? []).join(", ")}

Context:
${contextJson}`,
      maxOutputTokens: 80,
    };
  }

  return {
    system: "You are a technical writer for MCP server documentation.",
    user: `Write a README in markdown for this MCP server in English.
Rules:
- Include: title, overview, setup, authentication (if relevant), usage, tools, examples
- Maximum 50000 characters
- Return markdown only

Context:
${contextJson}`,
    maxOutputTokens: 4000,
  };
}

export const REGISTRY_AI_GENERATE: ServerPluginToolDefinition = {
  name: "REGISTRY_AI_GENERATE",
  description:
    "Generate MCP metadata (description, short description, tags, categories, README) using an LLM connection.",
  inputSchema: RegistryAIGenerateInputSchema,
  outputSchema: RegistryAIGenerateOutputSchema,
  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryAIGenerateInputSchema>;
    const meshCtx = ctx as MeshToolContext;

    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const { system, user, maxOutputTokens } = buildPrompt(typedInput);
    const proxy = await meshCtx.createMCPProxy(typedInput.llmConnectionId);

    try {
      const llmResult = await proxy.callTool({
        name: "LLM_DO_GENERATE",
        arguments: {
          modelId: typedInput.modelId,
          callOptions: {
            temperature: 0.2,
            maxOutputTokens,
            prompt: [
              { role: "system", content: system },
              {
                role: "user",
                content: [{ type: "text", text: user }],
              },
            ],
          },
        },
      });

      if (llmResult.isError) {
        const message =
          llmResult.content?.find((part) => part.type === "text")?.text ??
          "Failed to generate content";
        throw new Error(message);
      }

      const rawText = extractTextOutput(llmResult);

      if (typedInput.type === "tags" || typedInput.type === "categories") {
        const items = normalizeList(
          rawText.split(/[,\n;]/).map((value) => value.replace(/^[-*]\s*/, "")),
        );

        if (typedInput.type === "tags") {
          return { items: items.slice(0, 5) };
        }
        return { items: items.slice(0, 1) };
      }

      if (typedInput.type === "description") {
        return { result: rawText.slice(0, 1500) };
      }
      if (typedInput.type === "short_description") {
        return { result: rawText.slice(0, 160) };
      }
      if (typedInput.type === "readme") {
        return { result: rawText.slice(0, 50000) };
      }

      return { result: rawText };
    } finally {
      await proxy.close?.().catch(() => {});
    }
  },
};

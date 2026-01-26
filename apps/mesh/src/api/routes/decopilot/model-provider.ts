/**
 * Decopilot Model Provider
 *
 * Factory for creating ModelProvider instances from MCP connections.
 */

import { LanguageModelBinding } from "@decocms/bindings/llm";

import { createLLMProvider } from "../../llm-provider";
import { toServerClient } from "../proxy";
import type { MeshContext } from "@/core/mesh-context";
import type { ModelProvider } from "./types";

/**
 * Create a ModelProvider from a proxy client
 */
export async function createModelProviderFromProxy(
  proxy: Awaited<ReturnType<MeshContext["createMCPProxy"]>>,
  config: {
    modelId: string;
    connectionId: string;
    cheapModelId?: string | null;
  },
): Promise<ModelProvider> {
  const llmBinding = LanguageModelBinding.forClient(toServerClient(proxy));

  const llmProvider = createLLMProvider(llmBinding);
  const model = llmProvider.languageModel(config.modelId);
  const cheapModel = config.cheapModelId
    ? llmProvider.languageModel(config.cheapModelId)
    : undefined;

  return {
    model,
    modelId: config.modelId,
    connectionId: config.connectionId,
    cheapModel,
  };
}

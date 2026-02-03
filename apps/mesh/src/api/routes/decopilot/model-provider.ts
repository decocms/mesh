/**
 * Decopilot Model Provider
 *
 * Factory for creating ModelProvider instances from MCP connections.
 */

import { LanguageModelBinding } from "@decocms/bindings/llm";

import { createLLMProvider } from "../../llm-provider";
import {
  type MCPProxyClient,
  type StreamableMCPProxyClient,
  toServerClient,
} from "../proxy";
import type { ModelProvider } from "./types";

/**
 * Create a ModelProvider from a proxy client
 * Accepts both regular and streamable proxy clients
 */
export async function createModelProviderFromProxy(
  proxy: MCPProxyClient | StreamableMCPProxyClient,
  config: {
    modelId: string;
    connectionId: string;
    fastId?: string | null;
  },
): Promise<ModelProvider> {
  const llmBinding = LanguageModelBinding.forClient(toServerClient(proxy));

  const llmProvider = createLLMProvider(llmBinding);
  const model = llmProvider.languageModel(config.modelId);
  const cheapModel = config.fastId
    ? llmProvider.languageModel(config.fastId)
    : undefined;

  return {
    model,
    modelId: config.modelId,
    connectionId: config.connectionId,
    cheapModel,
  };
}

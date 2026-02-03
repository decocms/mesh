/**
 * Decopilot Model Provider
 *
 * Factory for creating ModelProvider instances from MCP connections.
 */

import { LanguageModelBinding } from "@decocms/bindings/llm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { createLLMProvider } from "../../llm-provider";
import { toServerClient } from "../proxy";
import type { ModelProvider } from "./types";

/**
 * Create a ModelProvider from an MCP client
 * Accepts both regular and streamable clients
 */
export async function createModelProviderFromClient(
  client: Client & {
    callStreamableTool?: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<Response>;
  },
  config: {
    modelId: string;
    connectionId: string;
    fastId?: string | null;
  },
): Promise<ModelProvider> {
  const llmBinding = LanguageModelBinding.forClient(toServerClient(client));

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

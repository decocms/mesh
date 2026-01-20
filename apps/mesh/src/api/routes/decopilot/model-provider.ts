/**
 * Decopilot Model Provider
 *
 * Factory for creating ModelProvider instances from MCP connections.
 */

import { LanguageModelBinding } from "@decocms/bindings/llm";

import type { MeshContext } from "@/core/mesh-context";
import { createLLMProvider } from "../../llm-provider";
import { getConnectionById } from "./helpers";
import type { ModelProvider } from "./types";

/**
 * Create a ModelProvider from a connection
 */
export async function createModelProvider(
  ctx: MeshContext,
  config: { organizationId: string; modelId: string; connectionId: string },
): Promise<ModelProvider> {
  const connection = await getConnectionById(
    ctx,
    config.organizationId,
    config.connectionId,
  );
  if (!connection) {
    throw new Error(`Connection not found: ${config.connectionId}`);
  }

  const proxy = await ctx.createMCPProxy(connection);
  const llmBinding = LanguageModelBinding.forClient(proxy);
  const model = createLLMProvider(llmBinding).languageModel(config.modelId);

  return {
    model,
    modelId: config.modelId,
    connectionId: config.connectionId,
  };
}

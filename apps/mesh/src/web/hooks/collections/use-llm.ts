/**
 * LLM Collection Hooks
 *
 * Provides React hooks for working with LLM models from remote connections
 * using React Query.
 */

import type { ModelCollectionEntitySchema } from "@decocms/bindings/llm";
import { z } from "zod";
import { UNKNOWN_CONNECTION_ID, createToolCaller } from "../../../tools/client";
import {
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";
import { useConnections } from "./use-connection";
import { useBindingConnections } from "../use-binding";

// LLM type matching ModelSchema from @decocms/bindings
export type LLM = z.infer<typeof ModelCollectionEntitySchema>;

/**
 * Options for useLLMsFromConnection hook
 */
export type UseLLMsOptions = UseCollectionListOptions<LLM>;

/**
 * Hook to get all LLM models from a specific connection
 *
 * @param connectionId - The ID of the connection to fetch LLMs from
 * @param options - Filter and configuration options
 * @returns Suspense query result with LLMs
 */
export function useLLMsFromConnection(
  connectionId: string | undefined,
  options: UseLLMsOptions = {},
) {
  // Use a placeholder ID when connectionId is undefined to ensure hooks are always called
  // in the same order (Rules of Hooks compliance)
  const safeConnectionId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(safeConnectionId);

  return useCollectionList<LLM>(safeConnectionId, "LLM", toolCaller, options);
}

/**
 * Hook to get all connections that support the LLMS binding
 *
 * @returns Array of connections with LLMS binding
 */
export function useModelConnections() {
  const allConnections = useConnections();
  const modelsConnections = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });

  return modelsConnections;
}

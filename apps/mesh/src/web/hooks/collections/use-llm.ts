/**
 * LLM Collection Hooks
 *
 * Provides React hooks for working with LLM models from remote connections
 * using React Query.
 */

import type { ModelCollectionEntitySchema } from "@decocms/bindings/llm";
import { z } from "zod";
import {
  useCollectionList,
  useConnections,
  useMCPClient,
  useProjectContext,
  type UseCollectionListOptions,
} from "@decocms/mesh-sdk";
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
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: connectionId ?? null,
    orgSlug: org.slug,
  });
  const scopeKey = connectionId ?? "no-connection";
  return useCollectionList<LLM>(scopeKey, "LLM", client, options);
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

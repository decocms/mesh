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
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

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
 * Hook to get a single LLM by ID from a specific connection
 *
 * @param connectionId - The ID of the connection
 * @param llmId - The ID of the LLM to fetch
 * @returns Suspense query result with the LLM
 */
export function useLLMFromConnection(
  connectionId: string | undefined,
  llmId: string | undefined,
) {
  const safeConnectionId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(safeConnectionId);

  return useCollectionItem<LLM>(safeConnectionId, "LLM", llmId, toolCaller);
}

/**
 * Hook to get LLM mutation actions (create, update, delete) for a specific connection
 *
 * @param connectionId - The ID of the connection
 * @returns Object with create, update, and delete mutation hooks
 */
export function useLLMActions(connectionId: string | undefined) {
  const safeConnectionId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(safeConnectionId);

  return useCollectionActions<LLM>(safeConnectionId, "LLM", toolCaller);
}

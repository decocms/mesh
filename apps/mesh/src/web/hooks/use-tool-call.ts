/**
 * useToolCall Hook
 *
 * Generic hook for calling MCP tools with React Query Suspense.
 * Uses Suspense for loading states - wrap components in <Suspense> and <ErrorBoundary>.
 */

import {
  Query,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { ToolCaller } from "../../tools/client";
import { KEYS } from "../lib/query-keys";

/**
 * Options for useToolCall hook
 */
export interface UseToolCallOptions<TInput, _TOutput> {
  /** The tool caller function to use */
  toolCaller: ToolCaller;
  /** The name of the tool to call */
  toolName: string;
  /** The input parameters for the tool */
  toolInputParams: TInput;
  /** Connection ID to scope the cache (optional) */
  connectionId?: string;
  /** Cache time in milliseconds */
  staleTime?: number;
  /** Refetch interval in milliseconds (false to disable) */
  refetchInterval?:
    | number
    | ((
        query: Query<_TOutput, Error, _TOutput, readonly unknown[]>,
      ) => number | false)
    | false;
  /** Whether to enable the tool call */
  enabled?: boolean;
}

/**
 * Generic hook for calling MCP tools with React Query Suspense
 *
 * @param options - Configuration for the tool call
 * @returns Query result with data (uses Suspense for loading, ErrorBoundary for errors)
 *
 * @example
 * ```tsx
 * <Suspense fallback={<Loader />}>
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 * </Suspense>
 *
 * function MyComponent() {
 *   const { data } = useToolCall({
 *     toolCaller: createToolCaller(),
 *     toolName: "COLLECTION_LLM_LIST",
 *     toolInputParams: { limit: 10 },
 *   });
 *   return <div>{data}</div>;
 * }
 * ```
 */
export function useToolCall<TInput, TOutput>(
  options: UseToolCallOptions<TInput, TOutput>,
) {
  const {
    toolCaller,
    toolName,
    toolInputParams,
    connectionId,
    staleTime = 60_000,
    refetchInterval,
  } = options;

  // Serialize the input params for the query key
  const paramsKey = JSON.stringify(toolInputParams);

  return useSuspenseQuery<TOutput, Error, TOutput>({
    staleTime,
    refetchInterval,
    queryKey: KEYS.toolCall(toolName, paramsKey, connectionId),
    queryFn: async () => {
      const result = await toolCaller(toolName, toolInputParams);
      return result as TOutput;
    },
  });
}

export interface UseToolCallMutationOptions {
  toolCaller: ToolCaller;
  toolName: string;
}
export function useToolCallMutation<TInput>(
  options: UseToolCallMutationOptions,
) {
  const { toolCaller, toolName } = options;

  return useMutation({
    mutationFn: async (input: TInput) => {
      const result = await toolCaller(toolName, input);
      return result;
    },
    onSuccess: (data) => {
      console.log("tool call mutation success", data);
    },
    onError: (error) => {
      console.error("tool call mutation error", error);
    },
  });
}

export function useToolCallQuery<TInput, TOutput>(
  options: UseToolCallOptions<TInput, TOutput>,
) {
  const {
    toolCaller,
    toolName,
    toolInputParams,
    connectionId,
    staleTime = 60_000,
    refetchInterval,
    enabled,
  } = options;

  return useQuery({
    queryKey: KEYS.toolCall(
      toolName,
      JSON.stringify(toolInputParams ?? {}),
      connectionId,
    ),
    queryFn: async () => {
      const result = await toolCaller(toolName, toolInputParams ?? {});
      return result as TOutput;
    },
    enabled,
    staleTime,
    refetchInterval,
  });
}

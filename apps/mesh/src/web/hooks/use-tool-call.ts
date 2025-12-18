/**
 * useToolCall Hook
 *
 * Generic hook for calling MCP tools with React Query Suspense.
 * Uses Suspense for loading states - wrap components in <Suspense> and <ErrorBoundary>.
 */

import {
  useSuspenseQuery,
  UseSuspenseQueryOptions,
} from "@tanstack/react-query";
import type { ToolCaller } from "../../tools/client";
import { KEYS } from "../lib/query-keys";

/**
 * Options for useToolCall hook
 */
export interface UseToolCallOptions<TInput, TOutput>
  extends Omit<UseSuspenseQueryOptions<TOutput>, "queryKey" | "queryFn"> {
  /** The tool caller function to use */
  toolCaller: ToolCaller;
  /** The name of the tool to call */
  toolName: string;
  /** The input parameters for the tool */
  toolInputParams: TInput;
  /** Scope to cache the tool call (connectionId for connection-scoped, locator for org/project-scoped) */
  scope: string;
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
 *   const { locator } = useProjectContext();
 *   const { data } = useToolCall({
 *     toolCaller: createToolCaller(),
 *     toolName: "COLLECTION_LLM_LIST",
 *     toolInputParams: { limit: 10 },
 *     scope: locator,
 *   });
 *   return <div>{data}</div>;
 * }
 * ```
 */
export function useToolCall<TInput, TOutput>({
  toolCaller,
  toolName,
  toolInputParams,
  scope,
  ...queryOptions
}: UseToolCallOptions<TInput, TOutput>) {
  // Serialize the input params for the query key
  const paramsKey = JSON.stringify(toolInputParams);

  return useSuspenseQuery<TOutput, Error, TOutput>({
    ...queryOptions,
    staleTime: queryOptions.staleTime ?? 60_000,
    queryKey: KEYS.toolCall(scope, toolName, paramsKey),
    queryFn: async () => {
      const result = await toolCaller(toolName, toolInputParams);
      return result as TOutput;
    },
  });
}

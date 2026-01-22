import {
  type Query,
  useMutation,
  useQuery,
  useSuspenseQuery,
  type UseMutationResult,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { useMCPClient, useProjectContext } from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";

/**
 * Options for useToolCall hook
 */
export interface UseToolCallOptions<TInput, TOutput>
  extends Omit<UseSuspenseQueryOptions<TOutput>, "queryKey" | "queryFn"> {
  /** The name of the tool to call */
  toolName: string;
  /** The input parameters for the tool */
  toolInputParams: TInput;
  /** Scope to cache the tool call (connectionId for connection-scoped, locator for org/project-scoped) */
  scope: string;
  /** Connection ID for tool calls (null for management tools) */
  connectionId: string | null;
  /** Whether this is a virtual MCP connection */
  isVirtualMCP?: boolean;
  /** Optional auth token for the MCP client */
  token?: string | null;
  /** Cache time in milliseconds */
  staleTime?: number;
  /** Refetch interval in milliseconds (false to disable) */
  refetchInterval?:
    | number
    | ((
        query: Query<TOutput, Error, TOutput, readonly unknown[]>,
      ) => number | false)
    | false;
}

/**
 * Generic hook for calling MCP tools with React Query Suspense
 *
 * @param options - Configuration for the tool call
 * @returns Query result with data (uses Suspense for loading, ErrorBoundary for errors)
 */
export function useToolCall<TInput, TOutput>({
  toolName,
  toolInputParams,
  scope,
  connectionId,
  isVirtualMCP,
  token,
  ...queryOptions
}: UseToolCallOptions<TInput, TOutput>): UseSuspenseQueryResult<
  TOutput,
  Error
> {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId,
    orgSlug: org.slug,
    isVirtualMCP,
    token,
  });
  // Serialize the input params for the query key
  const paramsKey = JSON.stringify(toolInputParams);

  return useSuspenseQuery<TOutput, Error, TOutput>({
    ...queryOptions,
    staleTime: queryOptions.staleTime ?? 60_000,
    queryKey: KEYS.toolCall(scope, toolName, paramsKey),
    queryFn: async () => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: toolName,
        arguments: toolInputParams as Record<string, unknown>,
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as TOutput;
      return payload;
    },
  });
}

export interface UseToolCallMutationOptions {
  toolName: string;
  connectionId: string | null;
  isVirtualMCP?: boolean;
  token?: string | null;
}

/**
 * Mutation hook for calling MCP tools via the MCP client.
 */
export function useToolCallMutation<TInput>(
  options: UseToolCallMutationOptions,
): UseMutationResult<unknown, Error, TInput> {
  const { org } = useProjectContext();
  const { toolName, connectionId, isVirtualMCP, token } = options;
  const client = useMCPClient({
    connectionId,
    orgSlug: org.slug,
    isVirtualMCP,
    token,
  });

  return useMutation({
    mutationFn: async (input: TInput) => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: toolName,
        arguments: input as Record<string, unknown>,
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as unknown;
    },
    onSuccess: (data) => {
      console.log("tool call mutation success", data);
    },
    onError: (error) => {
      console.error("tool call mutation error", error);
    },
  });
}

/**
 * Non-suspense query hook for calling MCP tools via the MCP client.
 */
export function useToolCallQuery<TInput, TOutput>(
  options: UseToolCallOptions<TInput, TOutput>,
): UseQueryResult<TOutput, Error> {
  const {
    toolName,
    toolInputParams,
    scope,
    connectionId,
    isVirtualMCP,
    token,
    staleTime = 60_000,
    refetchInterval,
  } = options;
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId,
    orgSlug: org.slug,
    isVirtualMCP,
    token,
  });

  return useQuery({
    queryKey: KEYS.toolCall(
      scope,
      toolName,
      JSON.stringify(toolInputParams ?? {}),
    ),
    queryFn: async () => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      const result = (await client.callTool({
        name: toolName,
        arguments: toolInputParams ?? {},
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as TOutput;
      return payload;
    },
    staleTime,
    refetchInterval,
    enabled: !!client,
  });
}

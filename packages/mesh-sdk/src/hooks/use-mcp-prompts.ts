import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  useQuery,
  UseQueryResult,
  useSuspenseQuery,
  UseSuspenseQueryResult,
  type UseQueryOptions,
  type UseSuspenseQueryOptions,
} from "@tanstack/react-query";
import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { KEYS } from "../lib/query-keys";

/**
 * List prompts from an MCP client.
 * This is the raw async function that can be used outside of React hooks.
 */
export async function listPrompts(client: Client): Promise<ListPromptsResult> {
  const capabilities = client.getServerCapabilities();
  if (!capabilities?.prompts) {
    return { prompts: [] };
  }
  return await client.listPrompts();
}

/**
 * Get a specific prompt from an MCP client.
 * This is the raw async function that can be used outside of React hooks.
 */
export async function getPrompt(
  client: Client,
  name: string,
  args?: GetPromptRequest["params"]["arguments"],
): Promise<GetPromptResult> {
  const capabilities = client.getServerCapabilities();
  if (!capabilities?.prompts) {
    throw new Error("Prompts capability not supported");
  }
  return await client.getPrompt({ name, arguments: args ?? {} });
}

export interface UseMcpPromptsListOptions
  extends Omit<
    UseSuspenseQueryOptions<ListPromptsResult, Error>,
    "queryKey" | "queryFn"
  > {
  /** The MCP client from useMCPClient */
  client: Client | null;
}

/**
 * Suspense hook to list prompts from an MCP client.
 * Must be used within a Suspense boundary.
 */
export function useMCPPromptsList({
  client,
  ...queryOptions
}: UseMcpPromptsListOptions): UseSuspenseQueryResult<ListPromptsResult, Error> {
  if (!client) {
    throw new Error("MCP client is not available");
  }

  return useSuspenseQuery<ListPromptsResult, Error>({
    ...queryOptions,
    queryKey: KEYS.mcpPromptsList(client),
    queryFn: () => listPrompts(client),
    staleTime: queryOptions.staleTime ?? 30000,
    retry: false,
  });
}

export interface UseMcpPromptsListQueryOptions
  extends Omit<
    UseQueryOptions<ListPromptsResult, Error>,
    "queryKey" | "queryFn"
  > {
  /** The MCP client from useMCPClient */
  client: Client | null;
}

/**
 * Non-suspense hook to list prompts from an MCP client.
 */
export function useMCPPromptsListQuery({
  client,
  ...queryOptions
}: UseMcpPromptsListQueryOptions): UseQueryResult<ListPromptsResult, Error> {
  return useQuery<ListPromptsResult, Error>({
    ...queryOptions,
    queryKey: KEYS.mcpPromptsList(client),
    queryFn: () => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      return listPrompts(client);
    },
    enabled: !!client,
    staleTime: queryOptions.staleTime ?? 30000,
    retry: false,
  });
}

export interface UseMcpGetPromptOptions
  extends Omit<
    UseSuspenseQueryOptions<GetPromptResult, Error>,
    "queryKey" | "queryFn"
  > {
  /** The MCP client from useMCPClient */
  client: Client | null;
  /** Prompt name */
  name: string;
  /** Optional prompt arguments */
  arguments?: GetPromptRequest["params"]["arguments"];
}

/**
 * Suspense hook to get a specific prompt from an MCP client.
 * Must be used within a Suspense boundary.
 */
export function useMCPGetPrompt({
  client,
  name,
  arguments: args,
  ...queryOptions
}: UseMcpGetPromptOptions): UseSuspenseQueryResult<GetPromptResult, Error> {
  if (!client || !name) {
    throw new Error("MCP client is not available");
  }

  return useSuspenseQuery<GetPromptResult, Error>({
    ...queryOptions,
    queryKey: KEYS.mcpGetPrompt(client, name, JSON.stringify(args ?? {})),
    queryFn: () => getPrompt(client, name, args),
    staleTime: queryOptions.staleTime ?? 30000,
    retry: false,
  });
}

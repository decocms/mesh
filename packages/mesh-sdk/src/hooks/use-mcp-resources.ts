import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  useQuery,
  useSuspenseQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type {
  ListResourcesResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { KEYS } from "../lib/query-keys";

/**
 * List resources from an MCP client.
 * This is the raw async function that can be used outside of React hooks.
 */
export async function listResources(
  client: Client,
): Promise<ListResourcesResult> {
  const capabilities = client.getServerCapabilities();
  if (!capabilities?.resources) {
    return { resources: [] };
  }
  return await client.listResources();
}

/**
 * Read a specific resource from an MCP client.
 * This is the raw async function that can be used outside of React hooks.
 */
export async function readResource(
  client: Client,
  uri: string,
): Promise<ReadResourceResult> {
  return await client.readResource({ uri });
}

export interface UseMcpResourcesListOptions
  extends Omit<
    UseSuspenseQueryOptions<ListResourcesResult, Error>,
    "queryKey" | "queryFn"
  > {
  /** The MCP client from useMCPClient */
  client: Client | null;
}

/**
 * Suspense hook to list resources from an MCP client.
 * Must be used within a Suspense boundary.
 */
export function useMCPResourcesList({
  client,
  ...queryOptions
}: UseMcpResourcesListOptions): UseSuspenseQueryResult<
  ListResourcesResult,
  Error
> {
  if (!client) {
    throw new Error("MCP client is not available");
  }

  return useSuspenseQuery<ListResourcesResult, Error>({
    ...queryOptions,
    queryKey: KEYS.mcpResourcesList(client),
    queryFn: () => listResources(client),
    staleTime: queryOptions.staleTime ?? 30000,
    retry: false,
  });
}

export interface UseMcpResourcesListQueryOptions
  extends Omit<
    UseQueryOptions<ListResourcesResult, Error>,
    "queryKey" | "queryFn"
  > {
  /** The MCP client from useMCPClient */
  client: Client | null;
}

/**
 * Non-suspense hook to list resources from an MCP client.
 */
export function useMCPResourcesListQuery({
  client,
  ...queryOptions
}: UseMcpResourcesListQueryOptions): UseQueryResult<
  ListResourcesResult,
  Error
> {
  return useQuery<ListResourcesResult, Error>({
    ...queryOptions,
    queryKey: KEYS.mcpResourcesList(client),
    queryFn: () => {
      if (!client) {
        throw new Error("MCP client is not available");
      }
      return listResources(client);
    },
    enabled: !!client,
    staleTime: queryOptions.staleTime ?? 30000,
    retry: false,
  });
}

export interface UseMcpReadResourceOptions
  extends Omit<
    UseSuspenseQueryOptions<ReadResourceResult, Error>,
    "queryKey" | "queryFn"
  > {
  /** The MCP client from useMCPClient */
  client: Client | null;
  /** Resource URI to read */
  uri: string;
}

/**
 * Suspense hook to read a specific resource from an MCP client.
 * Must be used within a Suspense boundary.
 */
export function useMCPReadResource({
  client,
  uri,
  ...queryOptions
}: UseMcpReadResourceOptions): UseSuspenseQueryResult<
  ReadResourceResult,
  Error
> {
  if (!client || !uri) {
    throw new Error("MCP client is not available");
  }

  return useSuspenseQuery<ReadResourceResult, Error>({
    ...queryOptions,
    queryKey: KEYS.mcpReadResource(client, uri),
    queryFn: () => readResource(client, uri),
    staleTime: queryOptions.staleTime ?? 30000,
    retry: false,
  });
}

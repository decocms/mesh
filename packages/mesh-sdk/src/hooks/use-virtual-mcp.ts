import { type UseSuspenseQueryResult } from "@tanstack/react-query";
import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
  ListResourcesResult,
  Prompt,
  Resource,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { useMCPClient } from "./use-mcp-client";
import { useMCPPromptsList, useMCPGetPrompt } from "./use-mcp-prompts";
import { useMCPResourcesList, useMCPReadResource } from "./use-mcp-resources";

export type VirtualMCPPrompt = Prompt;
export type VirtualMCPPromptResult = GetPromptResult;

export type VirtualMCPResource = Resource;
export type VirtualMCPResourceResult = ReadResourceResult;

/**
 * Suspense hook to fetch prompts from a virtual MCP via MCP protocol.
 * Must be used within a Suspense boundary.
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param org - The organization object with slug
 */
export function useVirtualMCPPrompts(
  virtualMcpId: string | null,
  org: { slug: string },
): UseSuspenseQueryResult<ListPromptsResult, Error> {
  const client = useMCPClient({
    connectionId: virtualMcpId,
    orgSlug: org.slug,
    isVirtualMCP: true,
  });

  return useMCPPromptsList({
    client,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Suspense hook to get a specific prompt from a virtual MCP.
 * Must be used within a Suspense boundary.
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param name - The prompt name
 * @param org - The organization object with slug
 * @param args - Optional prompt arguments
 */
export function useVirtualMCPPrompt(
  virtualMcpId: string | null,
  name: string,
  org: { slug: string },
  args?: GetPromptRequest["params"]["arguments"],
): UseSuspenseQueryResult<GetPromptResult, Error> {
  const client = useMCPClient({
    connectionId: virtualMcpId,
    orgSlug: org.slug,
    isVirtualMCP: true,
  });

  return useMCPGetPrompt({
    client,
    name,
    arguments: args,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Suspense hook to fetch resources from a virtual MCP via MCP protocol.
 * Must be used within a Suspense boundary.
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param org - The organization object with slug
 */
export function useVirtualMCPResources(
  virtualMcpId: string | null,
  org: { slug: string },
): UseSuspenseQueryResult<ListResourcesResult, Error> {
  const client = useMCPClient({
    connectionId: virtualMcpId,
    orgSlug: org.slug,
    isVirtualMCP: true,
  });

  return useMCPResourcesList({
    client,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Suspense hook to read a specific resource from a virtual MCP.
 * Must be used within a Suspense boundary.
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param uri - The resource URI
 * @param org - The organization object with slug
 */
export function useVirtualMCPResource(
  virtualMcpId: string | null,
  uri: string,
  org: { slug: string },
): UseSuspenseQueryResult<ReadResourceResult, Error> {
  const client = useMCPClient({
    connectionId: virtualMcpId,
    orgSlug: org.slug,
    isVirtualMCP: true,
  });

  return useMCPReadResource({
    client,
    uri,
    staleTime: 60000, // 1 minute
  });
}

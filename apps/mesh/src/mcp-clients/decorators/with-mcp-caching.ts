/**
 * MCP Caching Decorator
 *
 * Adds tool, resource, and prompt list caching to an MCP client.
 * Simple cache-read/write layer — no SWR (that lives in createLazyClient).
 * VIRTUAL connections bypass the cache entirely.
 */

import type { McpListCache } from "../mcp-list-cache";
import type { ConnectionEntity } from "@/tools/connection/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Decorator that adds caching for listTools, listResources, and listPrompts.
 *
 * Checks cache on read, populates on miss. VIRTUAL connections bypass cache.
 */
export function withMcpCaching(
  client: Client,
  connection: ConnectionEntity,
  cache?: McpListCache,
): Client {
  const isVirtualConnection = connection.connection_type === "VIRTUAL";
  const shouldBypassCache = (params?: unknown, options?: unknown) =>
    params !== undefined || options !== undefined;
  const canStoreResult = (result: { nextCursor?: string | undefined }) =>
    result.nextCursor === undefined;

  // --- listTools ---
  if (client.listTools) {
    const originalListTools = client.listTools.bind(client);
    client.listTools = async (params, options): Promise<ListToolsResult> => {
      if (
        !isVirtualConnection &&
        cache &&
        !shouldBypassCache(params, options)
      ) {
        const cached = await cache.get("tools", connection.id);
        if (cached !== null) {
          return { tools: cached as ListToolsResult["tools"] };
        }
      }
      const result = await originalListTools(params, options);
      if (
        !isVirtualConnection &&
        cache &&
        !shouldBypassCache(params, options) &&
        canStoreResult(result)
      ) {
        cache.set("tools", connection.id, result.tools).catch(() => {});
      }
      return result;
    };
  }

  // --- listResources ---
  if (client.listResources) {
    const originalListResources = client.listResources.bind(client);
    client.listResources = async (
      params,
      options,
    ): Promise<ListResourcesResult> => {
      if (
        !isVirtualConnection &&
        cache &&
        !shouldBypassCache(params, options)
      ) {
        const cached = await cache.get("resources", connection.id);
        if (cached !== null) {
          return { resources: cached as ListResourcesResult["resources"] };
        }
      }
      const result = await originalListResources(params, options);
      if (
        !isVirtualConnection &&
        cache &&
        !shouldBypassCache(params, options) &&
        canStoreResult(result)
      ) {
        cache.set("resources", connection.id, result.resources).catch(() => {});
      }
      return result;
    };
  }

  // --- listPrompts ---
  if (client.listPrompts) {
    const originalListPrompts = client.listPrompts.bind(client);
    client.listPrompts = async (
      params,
      options,
    ): Promise<ListPromptsResult> => {
      if (
        !isVirtualConnection &&
        cache &&
        !shouldBypassCache(params, options)
      ) {
        const cached = await cache.get("prompts", connection.id);
        if (cached !== null) {
          return { prompts: cached as ListPromptsResult["prompts"] };
        }
      }
      const result = await originalListPrompts(params, options);
      if (
        !isVirtualConnection &&
        cache &&
        !shouldBypassCache(params, options) &&
        canStoreResult(result)
      ) {
        cache.set("prompts", connection.id, result.prompts).catch(() => {});
      }
      return result;
    };
  }

  return client;
}

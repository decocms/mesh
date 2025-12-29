/**
 * Dynamic System Prompt Hook
 *
 * Generates a context-aware system prompt for the chat based on:
 * - The MCP Mesh environment
 * - Current route context (e.g., resource editing)
 */

import { useRouterState } from "@tanstack/react-router";

/**
 * Route context extracted from collection detail routes
 */
interface RouteContext {
  connectionId: string | null;
  collectionName: string | null;
  itemId: string | null;
}

/**
 * Parse route context from the current URL pathname
 * Looks for pattern: /:org/mcps/:connectionId/:collectionName/:itemId
 */
function parseRouteContext(pathname: string): RouteContext {
  const mcpsPattern = /\/[^/]+\/mcps\/([^/]+)\/([^/]+)\/([^/]+)/;
  const match = pathname.match(mcpsPattern);

  if (match && match[1] && match[2] && match[3]) {
    return {
      connectionId: decodeURIComponent(match[1]),
      collectionName: decodeURIComponent(match[2]),
      itemId: decodeURIComponent(match[3]),
    };
  }

  return { connectionId: null, collectionName: null, itemId: null };
}

/**
 * Hook that generates a dynamic system prompt based on context
 */
export function useSystemPrompt(): string {
  const routerState = useRouterState();
  const { connectionId, collectionName, itemId } = parseRouteContext(
    routerState.location.pathname,
  );

  return `You are an AI assistant running in an MCP Mesh environment.

## About MCP Mesh
The Model Context Protocol (MCP) Mesh allows users to connect external MCP servers and expose their capabilities through gateways. Each gateway provides access to a curated set of tools from connected MCP servers.

## Important Notes
- All tool calls are logged and audited for security and compliance
- You have access to the tools exposed through the selected gateway
- MCPs may expose resources that users can browse and edit

## Current Editing Context
${connectionId ? `- Connection ID: ${connectionId}` : ""}
${collectionName ? `- Collection Name: ${collectionName}` : ""}
${itemId ? `- Item ID: ${itemId}` : ""}

Help the user understand and work with this resource.
`;
}

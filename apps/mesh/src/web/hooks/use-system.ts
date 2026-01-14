/**
 * System Prompt Hook
 *
 * Composes a complete system prompt by combining:
 * - Base MCP Mesh instructions
 * - Selected gateway/agent context
 * - Gateway-specific stored system prompt instructions
 * - Current route editing context (connection/collection/item)
 */

import { useRouterState } from "@tanstack/react-router";
import { useGateways } from "./collections/use-gateway";

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
 * Hook that returns additional context for the language model
 *
 * @param gatewayId - The selected gateway/agent ID (optional)
 * @returns Additional context for the language model
 */
export function useClientContext(gatewayId?: string): Record<string, string> {
  const routerState = useRouterState();
  const { connectionId, collectionName, itemId } = parseRouteContext(
    routerState.location.pathname,
  );

  const gateways = useGateways();
  const gateway = gatewayId ? gateways.find((g) => g.id === gatewayId) : null;

  const context: Record<string, string> = {};
  if (gatewayId) context.gatewayId = gatewayId;
  if (gateway) context.gatewayName = gateway.title;
  if (connectionId) context.connectionId = connectionId;
  if (collectionName) context.collectionName = collectionName;
  if (itemId) context.itemId = itemId;

  return context;
}

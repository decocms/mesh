import { useParams } from "@tanstack/react-router";

export type DetailKind = "gateway" | "connection";

export type DetailRouteContext = {
  kind: DetailKind;
  org: string;
  itemId: string;
};

/**
 * Detects whether the current route is a gateway or connection detail page
 * and extracts the relevant IDs using useParams({ strict: false }).
 *
 * This works for both direct detail routes and nested routes (e.g. collection-detail)
 * because params remain present in nested routes.
 */
export function useDetailRouteContext(): DetailRouteContext | null {
  const { org, gatewayId, connectionId } = useParams({ strict: false });

  if (gatewayId && org) {
    return {
      kind: "gateway" as const,
      org,
      itemId: gatewayId,
    };
  }

  if (connectionId && org) {
    return {
      kind: "connection" as const,
      org,
      itemId: connectionId,
    };
  }

  return null;
}

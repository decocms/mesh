/**
 * Context Hook
 *
 * Provides dynamic context for the AI assistant based on:
 * - Current route parameters (connection, collection, item)
 * - Selected gateway/agent and its custom instructions
 *
 * This hook only returns context information; base system instructions
 * are handled server-side in models.ts (DECOPILOT_SYSTEM_PROMPT).
 */

import { useParams } from "@tanstack/react-router";
import { useGateway } from "./collections/use-gateway";

/**
 * Hook that generates context for the AI assistant based on current state
 *
 * @param gatewayId - The selected gateway/agent ID (optional)
 * @returns Context string to be sent to the backend
 */
export function useContext(gatewayId?: string | null): string {
  // Extract route parameters directly using useParams
  const params = useParams({ strict: false });
  const gateway = useGateway(gatewayId);

  // Get stored system prompt for this gateway

  const contextParts: string[] = [];

  // Add gateway context if selected
  if (gatewayId) {
    contextParts.push(`### Selected Agent/Gateway
- ID: ${gatewayId}`);

    // Add gateway-specific custom instructions if available
    if (gateway?.system_prompt?.trim()) {
      contextParts.push(`### Agent Instructions
${gateway?.system_prompt}`);
    }
  }

  // Add route context based on available params
  const routeContextParts: string[] = [];

  if (params.connectionId) {
    routeContextParts.push(`- Connection ID: ${params.connectionId}`);
  }

  if (params.collectionName) {
    routeContextParts.push(`- Collection: ${params.collectionName}`);
  }

  if (params.itemId) {
    routeContextParts.push(`- Item ID: ${params.itemId}`);
  }

  if (routeContextParts.length > 0) {
    contextParts.push(`### Current Resource
The user is viewing the following resource:
${routeContextParts.join("\n")}

Help the user understand and work with this resource.`);
  }

  return contextParts.join("\n\n");
}

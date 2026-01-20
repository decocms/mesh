/**
 * Context Hook
 *
 * Provides dynamic context for the AI assistant based on:
 * - Current route parameters (connection, collection, item)
 * - Selected virtual MCP (agent) and its custom instructions
 *
 * This hook only returns context information; base system instructions
 * are handled server-side in models.ts (DECOPILOT_SYSTEM_PROMPT).
 */

import { useParams } from "@tanstack/react-router";
import { useVirtualMCPSystemPrompt } from "./use-virtual-mcp-system-prompt";

/**
 * Hook that generates context for the AI assistant based on current state
 *
 * @param virtualMcpId - The selected virtual MCP (agent) ID (optional)
 * @returns Context string to be sent to the backend
 */
export function useContext(virtualMcpId?: string | null): string {
  // Extract route parameters directly using useParams
  const params = useParams({ strict: false });

  // Get stored system prompt for this virtual MCP
  const [virtualMcpPrompt] = useVirtualMCPSystemPrompt(
    virtualMcpId ?? undefined,
  );

  const contextParts: string[] = [];

  // Add virtual MCP context if selected
  if (virtualMcpId) {
    contextParts.push(`### Selected Agent
- ID: ${virtualMcpId}`);

    // Add virtual MCP-specific custom instructions if available
    if (virtualMcpPrompt?.trim()) {
      contextParts.push(`### Agent Instructions
${virtualMcpPrompt}`);
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

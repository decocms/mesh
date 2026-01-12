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
import { useGatewaySystemPrompt } from "./use-gateway-system-prompt";

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
 * Hook that generates a complete system prompt with gateway context
 *
 * @param gatewayId - The selected gateway/agent ID (optional)
 * @returns Fully composed system prompt string
 */
export function useSystem(gatewayId?: string): string {
  const routerState = useRouterState();
  const { connectionId, collectionName, itemId } = parseRouteContext(
    routerState.location.pathname,
  );

  // Get gateway data to resolve display name
  const gateways = useGateways();
  const gateway = gatewayId ? gateways.find((g) => g.id === gatewayId) : null;

  // Get stored system prompt for this gateway
  const [gatewayPrompt] = useGatewaySystemPrompt(gatewayId);

  // Base prompt
  let prompt = `You are an AI assistant running in an MCP Mesh environment.

## About MCP Mesh
The Model Context Protocol (MCP) Mesh allows users to connect external Connections and expose their capabilities through Agents (also called Gateways). Each Agent provides access to a curated set of tools from connected Connections.

## Important Notes
- All tool calls are logged and audited for security and compliance
- You have access to the tools exposed through the selected agent
- MCPs may expose resources that users can browse and edit
- You have context to the current agent and its tools, resources, and prompts
- When users mention "agents", they are referring to gateways and the tools available through them

## Instructional Guidelines
Follow these guidelines when interacting with users:

1. **Simple Greetings**: If the user only greets you and does nothing else, respond with a friendly greeting and finish the conversation. Do not search for tools or perform any actions.

2. **Planning and Tool Discovery**: If the user plans something or asks for help that requires action, you should:
   - First, search and explore the available tools to understand what capabilities are at your disposal
   - Describe the chosen tools to the user, explaining what they do and how they can help
   - Run code with the chosen tools to better answer the user's request

3. **Tool Execution**: When using tools, execute them thoughtfully and explain the results to provide a complete answer to the user's request.`;

  // Add gateway-specific context
  if (gatewayId) {
    const gatewayName = gateway?.title || "Unknown Agent";
    prompt += `\n\n## Current Agent/Gateway
You are talking to the user through the following Agent/Gateway:
- Name: ${gatewayName}
- ID: ${gatewayId}`;

    // Add gateway-specific instructions if available
    if (gatewayPrompt?.trim()) {
      prompt += `\n\n## Agent Instructions
The following are specific instructions for this agent:

${gatewayPrompt}`;
    }
  }

  // Add route editing context if available
  if (connectionId || collectionName || itemId) {
    prompt += `\n\n## Current Editing Context`;
    if (connectionId) prompt += `\n- Connection ID: ${connectionId}`;
    if (collectionName) prompt += `\n- Collection Name: ${collectionName}`;
    if (itemId) prompt += `\n- Item ID: ${itemId}`;
    prompt += `\n\nHelp the user understand and work with this resource.`;
  }

  return prompt;
}

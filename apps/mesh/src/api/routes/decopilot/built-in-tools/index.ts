/**
 * Decopilot Built-in Tools
 *
 * Client-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import { userAskTool } from "./user-ask";

export {
  UserAskInputSchema,
  UserAskOutputSchema,
  userAskTool,
} from "./user-ask";
export type { UserAskInput, UserAskOutput } from "./user-ask";

/**
 * Get all built-in tools as a ToolSet
 *
 * Returns a ToolSet (Record<string, CoreTool>) that can be merged
 * with MCP tools in the decopilot stream endpoint.
 */
export function getBuiltInTools() {
  return {
    user_ask: userAskTool,
  } as const;
}

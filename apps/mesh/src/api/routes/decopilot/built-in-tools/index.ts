/**
 * Decopilot Built-in Tools
 *
 * Client-side and server-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import { userAskTool } from "./user-ask";
import { createSubtaskTool, type SubtaskToolDeps } from "./subtask";

export {
  UserAskInputSchema,
  UserAskOutputSchema,
  userAskTool,
} from "./user-ask";
export type { UserAskInput, UserAskOutput } from "./user-ask";

export {
  SubtaskInputSchema,
  createSubtaskTool,
  buildSubagentSystemPrompt,
} from "./subtask";
export type { SubtaskInput, SubtaskToolDeps } from "./subtask";

/**
 * Get all built-in tools as a ToolSet.
 * Deps required so ChatMessage type (via ReturnType<typeof getBuiltInTools>)
 * always includes subtask in the parts union.
 */
export function getBuiltInTools(deps: SubtaskToolDeps) {
  return {
    user_ask: userAskTool,
    subtask: createSubtaskTool(deps),
  } as const;
}

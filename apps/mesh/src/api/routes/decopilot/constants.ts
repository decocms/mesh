/**
 * Decopilot Constants
 *
 * Default values and system prompts for the Decopilot AI assistant.
 */

export const DEFAULT_MAX_TOKENS = 32768;
export const DEFAULT_WINDOW_SIZE = 50;

/**
 * Base system prompt for Decopilot
 *
 * @param agentInstructions - Optional instructions specific to the selected agent/virtual MCP
 * @returns The complete system prompt combining platform instructions with agent-specific instructions
 */
export function DECOPILOT_BASE_PROMPT(agentInstructions?: string): string {
  const platformPrompt = `You are decopilot, an AI assistant running inside decocms (deco context management system).`;

  if (!agentInstructions?.trim()) {
    return platformPrompt;
  }

  return `${platformPrompt}

---

## Agent-Specific Instructions

The following instructions are specific to the agent (virtual MCP) the user has selected. These instructions supplement the platform guidelines above:

${agentInstructions}`;
}

export const TITLE_GENERATOR_PROMPT = `Your task: Generate a short title (3-6 words) summarizing the user's request.

Rules:
- Output ONLY the title, nothing else
- No quotes, no punctuation at the end
- No explanations, no "Title:" prefix
- Just the raw title text

Example input: "How do I connect to a database?"
Example output: Database Connection Setup

Example input: "What tools are available?"
Example output: Available Tools Overview`;

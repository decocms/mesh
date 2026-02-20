import { generatePrefixedId } from "@/shared/utils/generate-id";
import type { ChatMessage } from "./types";

/** Message ID generator. Use as closure where a () => string is expected (e.g. toUIMessageStreamResponse). */
export const generateMessageId = () => generatePrefixedId("msg");

export const DEFAULT_MAX_TOKENS = 32768;
export const DEFAULT_WINDOW_SIZE = 50;
export const DEFAULT_THREAD_TITLE = "New chat";

export const PARENT_STEP_LIMIT = 30;
export const SUBAGENT_STEP_LIMIT = 15;
export const SUBAGENT_EXCLUDED_TOOLS = ["user_ask", "subtask"];

/**
 * Base system prompt for Decopilot
 *
 * @param agentInstructions - Optional instructions specific to the selected agent/virtual MCP
 * @returns ChatMessage with the base system prompt
 */
export function DECOPILOT_BASE_PROMPT(agentInstructions?: string): ChatMessage {
  const platformPrompt = `You are decopilot, an AI assistant running inside decocms (deco context management system).`;

  let text = platformPrompt;
  if (agentInstructions?.trim()) {
    text += `

---

## Agent-Specific Instructions

The following instructions are specific to the agent (virtual MCP) the user has selected. These instructions supplement the platform guidelines above:

${agentInstructions}`;
  }

  return {
    id: "decopilot-system",
    role: "system",
    parts: [{ type: "text", text }],
  };
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

export const DESCRIPTION_GENERATOR_PROMPT = `Your task: Summarize what the AI assistant did or said in 8-15 words.

Rules:
- Output ONLY the summary, nothing else
- No quotes, no punctuation at the end
- No explanations, no "Summary:" prefix
- Use past tense for completed actions
- If the assistant asked the user a question, include the question topic
- Be specific and descriptive, not generic
- Just the raw summary text

Example input: "I've created the database migration files and updated the schema to include the new columns you requested."
Example output: Created database migration files and updated schema with new columns

Example input: "Here's a poem I wrote about autumn. What feeling or mood does this poem evoke for you?"
Example output: Wrote an autumn poem and asking what mood it evokes

Example input: "I encountered an error: ECONNREFUSED when trying to connect to the Slack API."
Example output: Failed to connect to Slack API due to connection refused error

Example input: "I've summarized 17 Slack threads and organized them into your Notion workspace."
Example output: Summarized 17 Slack threads into Notion workspace`;

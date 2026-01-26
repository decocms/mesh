/**
 * Perplexity AI Binding
 *
 * Matches the official @perplexity-ai/mcp-server tools:
 * - perplexity_ask: Conversation using Sonar API
 * - perplexity_research: Deep research with citations
 * - perplexity_reason: Reasoning tasks
 */
import { z } from "zod";
import { type ToolBinder, bindingClient } from "../core/binder";

/**
 * Message schema for Perplexity tools
 */
const PerplexityMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

/**
 * Input schema for perplexity tools - array of messages
 */
const PerplexityInputSchema = z.object({
  messages: z.array(PerplexityMessageSchema),
});

/**
 * Output schema for perplexity responses
 */
const PerplexityOutputSchema = z.object({
  content: z.string(),
  citations: z.array(z.string()).optional(),
});

/**
 * Perplexity binding definition
 *
 * Matches any MCP with perplexity_ask tool.
 * perplexity_research and perplexity_reason are optional.
 */
export const PERPLEXITY_BINDING = [
  {
    name: "perplexity_ask" as const,
    inputSchema: PerplexityInputSchema,
    outputSchema: PerplexityOutputSchema,
  },
  {
    name: "perplexity_research" as const,
    inputSchema: PerplexityInputSchema,
    outputSchema: PerplexityOutputSchema,
    opt: true,
  },
  {
    name: "perplexity_reason" as const,
    inputSchema: PerplexityInputSchema,
    outputSchema: PerplexityOutputSchema,
    opt: true,
  },
] satisfies ToolBinder[];

export const PerplexityBinding = bindingClient(PERPLEXITY_BINDING);

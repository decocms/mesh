/**
 * CODE_EXECUTION Tool Schemas
 *
 * Shared Zod schemas for code execution tools (search, describe, run).
 */

import { z } from "zod";

// ============================================================================
// Search Tools Schema
// ============================================================================

export const SearchToolsInputSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural language search query (e.g., 'send email', 'create order')",
    ),
  limit: z
    .number()
    .default(10)
    .describe("Maximum results to return (default: 10)"),
});

export const SearchToolsOutputSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      connection: z.string(),
    }),
  ),
  totalAvailable: z.number(),
});

// ============================================================================
// Describe Tools Schema
// ============================================================================

export const DescribeToolsInputSchema = z.object({
  tools: z
    .array(z.string())
    .min(1)
    .describe("Array of tool names to get detailed schemas for"),
});

export const DescribeToolsOutputSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      connection: z.string(),
      inputSchema: z.unknown(),
      outputSchema: z.unknown().optional(),
    }),
  ),
  notFound: z.array(z.string()),
});

// ============================================================================
// Run Code Schema
// ============================================================================

export const RunCodeInputSchema = z.object({
  code: z
    .string()
    .min(1)
    .describe(
      "JavaScript code to execute. It runs as an async function body; you can use top-level `return` and `await`.",
    ),
  timeoutMs: z
    .number()
    .default(3000)
    .describe("Max execution time in milliseconds (default: 3000)."),
});

export const RunCodeOutputSchema = z.object({
  returnValue: z.unknown().optional(),
  error: z.string().optional(),
  consoleLogs: z.array(
    z.object({
      type: z.enum(["log", "warn", "error"]),
      content: z.string(),
    }),
  ),
});

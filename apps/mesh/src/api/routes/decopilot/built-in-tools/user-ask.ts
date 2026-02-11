/**
 * user_ask Built-in Tool
 *
 * Client-side tool for gathering user input during task execution.
 * Uses AI SDK tool() function (not MCP defineTool).
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";

/**
 * Input schema for user_ask (Zod)
 * Exported for testing and type inference
 */
export const UserAskInputSchema = z
  .object({
    prompt: z.string().min(1).describe("Question to ask the user"),
    type: z
      .enum(["text", "choice", "confirm"])
      .describe("Type of input to request"),
    options: z
      .array(z.string())
      .optional()
      .describe("Available choices (required for 'choice' type)"),
    default: z.string().optional().describe("Default value"),
  })
  .refine(
    (data) => {
      // If type is 'choice', options must be provided with at least 2 items
      if (data.type === "choice") {
        return data.options && data.options.length >= 2;
      }
      return true;
    },
    {
      message: "Options array with at least 2 items required for 'choice' type",
      path: ["options"],
    },
  );

export type UserAskInput = z.infer<typeof UserAskInputSchema>;

/**
 * Output schema for user_ask (Zod)
 * Exported for testing and type inference
 */
export const UserAskOutputSchema = z.object({
  response: z.string().describe("User's response"),
});

export type UserAskOutput = z.infer<typeof UserAskOutputSchema>;

/**
 * user_ask tool definition (AI SDK)
 *
 * This is a CLIENT-SIDE tool - it has NO execute function.
 * The tool call is sent to the client, where the UI renders
 * an interactive prompt and the user provides a response.
 */
export const userAskTool = tool({
  description: `
Always use this tool when you need to ask the user a question. Do not ask questions in plain text—use user_ask instead.

Types: 'text' (free-form input), 'choice' (select from options; requires at least 2 options), 'confirm' (yes/no).

Use proactively when requirements are ambiguous, multiple valid approaches exist, a decision significantly impacts the solution, or before destructive changes.
`.replace(/\s+/g, " "),
  inputSchema: zodSchema(UserAskInputSchema),
  outputSchema: zodSchema(UserAskOutputSchema),
});

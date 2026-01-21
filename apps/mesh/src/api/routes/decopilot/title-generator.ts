/**
 * Decopilot Title Generator
 *
 * Generates conversation titles in the background using LLM.
 */

import { generateText } from "ai";

import type { ModelProvider } from "./types";
import { TITLE_GENERATOR_PROMPT } from "./constants";

/**
 * Generate a short title for the conversation in the background.
 * Writes to the stream writer when complete.
 */
export async function generateTitleInBackground(config: {
  abortSignal: AbortSignal;
  model: ModelProvider["model"];
  userMessage: string;
  onTitle?: (title: string) => void;
}): Promise<void> {
  const { abortSignal, model, userMessage, onTitle } = config;

  try {
    const result = await generateText({
      model,
      system: TITLE_GENERATOR_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: 30,
      temperature: 0.2,
      abortSignal,
    });

    // Extract just the first line, clean up any formatting
    const rawTitle = result.text.trim();
    const firstLine = rawTitle.split("\n")[0] ?? rawTitle;
    const title = firstLine
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/^(Title:|title:)\s*/i, "") // Remove "Title:" prefix
      .replace(/[.!?]$/, "") // Remove trailing punctuation
      .slice(0, 60) // Max 60 chars
      .trim();

    onTitle?.(title);
  } catch (error) {
    const err = error as Error;
    console.error(
      "[decopilot:title] ❌ Failed to generate title:",
      err.message,
    );
  }
}

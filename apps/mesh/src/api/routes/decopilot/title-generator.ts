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
const TITLE_TIMEOUT_MS = 2500;

export async function generateTitleInBackground(config: {
  abortSignal: AbortSignal;
  model: ModelProvider["model"];
  userMessage: string;
  onTitle?: (title: string) => void;
}): Promise<void> {
  const { abortSignal, model, userMessage, onTitle } = config;

  // Create a local abort controller for title generation only
  const titleAbortController = new AbortController();

  // Abort title generation if parent stream is aborted
  const onParentAbort = () => titleAbortController.abort();
  abortSignal.addEventListener("abort", onParentAbort, { once: true });

  // Abort title generation after timeout (doesn't affect parent stream)
  const timeoutId = setTimeout(() => {
    titleAbortController.abort();
  }, TITLE_TIMEOUT_MS);

  try {
    const result = await generateText({
      model,
      system: TITLE_GENERATOR_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: 60,
      temperature: 0.2,
      abortSignal: titleAbortController.signal,
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
    if (err.name === "AbortError") {
      console.warn(
        "[decopilot:title] Title generation aborted (timeout or parent abort)",
      );
    } else {
      console.error(
        "[decopilot:title] ❌ Failed to generate title:",
        err.message,
      );
    }
  } finally {
    clearTimeout(timeoutId);
    abortSignal.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Decopilot Description Generator
 *
 * Generates short thread descriptions in the background using LLM.
 * Mirrors the title-generator pattern.
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import { generateText } from "ai";

import { DESCRIPTION_GENERATOR_PROMPT } from "./constants";

const DESCRIPTION_TIMEOUT_MS = 3000;

export async function generateDescriptionInBackground(config: {
  model: LanguageModelV2;
  assistantText: string;
}): Promise<string | null> {
  const { model, assistantText } = config;

  if (!assistantText || assistantText.trim().length < 10) {
    return null;
  }

  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, DESCRIPTION_TIMEOUT_MS);

  try {
    const result = await generateText({
      model,
      system: DESCRIPTION_GENERATOR_PROMPT,
      messages: [{ role: "user", content: assistantText.slice(0, 2000) }],
      maxOutputTokens: 80,
      temperature: 0.2,
      abortSignal: abortController.signal,
    });

    const rawDescription = result.text.trim();
    const firstLine = rawDescription.split("\n")[0] ?? rawDescription;
    const description = firstLine
      .replace(/^["']|["']$/g, "")
      .replace(/^(Summary:|summary:|Description:|description:)\s*/i, "")
      .replace(/[.!?]$/, "")
      .slice(0, 100)
      .trim();

    return description || null;
  } catch (error) {
    const err = error as Error;
    if (err.name === "AbortError") {
      console.warn(
        "[decopilot:description] Description generation aborted (timeout)",
      );
    } else {
      console.error(
        "[decopilot:description] Failed to generate description:",
        err.message,
      );
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Thread Status Resolution
 *
 * Maps AI SDK stream finish reason and response parts to ThreadStatus.
 * Extracted for testability.
 */

import type { ThreadStatus } from "@/storage/types";

type ResponsePart = {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
};

/**
 * Returns true if the text contains a direct question to the user (sentence-ending ?).
 * Strips URLs, code blocks, and inline code to avoid false positives from query strings,
 * ternary operators, regex literals, etc.
 */
function hasDirectQuestion(text: string): boolean {
  const sanitized = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/www\.\S+/g, "");

  const lastParagraph = sanitized.split(/\n\s*\n/).at(-1) ?? sanitized;
  return /\?(\s|[)"'\]},]|$)/m.test(lastParagraph);
}

/**
 * Resolves the thread status from the AI SDK stream result.
 *
 * @param finishReason - The AI SDK finish reason for the last step
 * @param responseParts - The parts array from the response UIMessage
 * @returns The resolved ThreadStatus
 */
export function resolveThreadStatus(
  finishReason: string | undefined,
  responseParts: ResponsePart[] = [],
): ThreadStatus {
  if (finishReason === "stop") {
    // Question in last text part -> waiting for user answer
    const lastTextPart = responseParts.findLast((p) => p.type === "text");
    if (lastTextPart?.text && hasDirectQuestion(lastTextPart.text)) {
      return "requires_action";
    }
    return "completed";
  }

  if (finishReason === "tool-calls") {
    // Check if user_ask is waiting for input
    // Codebase uses "tool-user_ask" part type with states:
    //   "input-available" = waiting for user input (pending)
    //   "output-available" = user has responded (done)
    const hasUserAskPending = responseParts.some(
      (part) =>
        part.type === "tool-user_ask" && part.state === "input-available",
    );

    // Check if any tools are awaiting approval
    const hasApprovalPending = responseParts.some(
      (part) => part.state === "approval-requested",
    );

    return hasUserAskPending || hasApprovalPending
      ? "requires_action"
      : "completed";
  }

  // "length", "content-filter", "error", "other", "unknown", undefined
  return "failed";
}

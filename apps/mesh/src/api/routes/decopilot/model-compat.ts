/**
 * Model Compatibility Checks
 *
 * Validates that messages are compatible with model capabilities.
 * Extensible for future checks (vision, tools, context length, etc.).
 */

import type { ChatModelConfig } from "@/web/components/chat/types";
import { HTTPException } from "hono/http-exception";

/** Message shape needed for compatibility checks (supports ChatMessage | ThreadMessage) */
type MessageWithParts = { parts?: Array<{ type: string }> };

/**
 * Validate that messages are compatible with the model's capabilities.
 * Throws HTTPException if incompatible.
 */
export function ensureModelCompatibility(
  model: ChatModelConfig,
  messages: MessageWithParts[],
): void {
  const modelHasVision = model.capabilities?.vision ?? true;

  if (!modelHasVision) {
    const hasFiles = messages.some((message) =>
      message.parts?.some((part) => part.type === "file"),
    );
    if (hasFiles) {
      throw new HTTPException(400, {
        message:
          "This model does not support file uploads. Please change the model and try again.",
      });
    }
  }

  // Add more checks here as needed (e.g. tools, context length)
}

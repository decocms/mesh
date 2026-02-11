import type { UserAskInput } from "@/api/routes/decopilot/built-in-tools/index.ts";
import { z } from "zod";

const textResponseSchema = z.object({
  response: z.string().min(1, "Response is required"),
});

const choiceResponseSchema = z.object({
  response: z.string().min(1, "Please select or enter an option"),
});

const confirmResponseSchema = z.object({
  response: z.enum(["yes", "no"]),
});

function getUserAskSchema(input: UserAskInput) {
  switch (input.type) {
    case "text":
      return textResponseSchema;
    case "choice":
      return choiceResponseSchema;
    case "confirm":
      return confirmResponseSchema;
    default:
      return textResponseSchema;
  }
}

/**
 * Build a combined Zod schema for all pending user-ask parts.
 * Shape: { [toolCallId]: { response: string }, ... }
 */
export function buildCombinedSchema(
  parts: { toolCallId: string; input: UserAskInput }[],
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const part of parts) {
    shape[part.toolCallId] = getUserAskSchema(part.input);
  }
  return z.object(shape);
}

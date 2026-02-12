interface UIMessageLike {
  parts?: Array<{ type: string; text?: string }>;
}

export function getToolPartErrorText(
  part: Record<string, unknown>,
  fallback = "An unknown error occurred",
): string {
  return "errorText" in part && typeof part.errorText === "string"
    ? part.errorText
    : fallback;
}

export function extractTextFromOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const msg = output as UIMessageLike;
  if (!Array.isArray(msg.parts)) return null;

  const textParts = msg.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string);

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

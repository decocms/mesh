import {
  DynamicToolUIPart,
  ToolUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from "ai";

export function getToolPartErrorText(
  part: Record<string, unknown>,
  fallback = "An unknown error occurred",
): string {
  return "errorText" in part && typeof part.errorText === "string"
    ? part.errorText
    : fallback;
}

const isToolLike = (
  p: UIMessagePart<UIDataTypes, UITools>,
): p is DynamicToolUIPart | ToolUIPart => {
  return p.type === "dynamic-tool" || p.type.startsWith("tool-");
};

export function extractTextFromOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const msg = output as UIMessage;
  if (!Array.isArray(msg.parts)) return null;

  const textParts: string[] = [];
  for (const p of msg.parts) {
    if (p.type === "text" && typeof p.text === "string") {
      textParts.push(p.text);
    } else if (p.type === "reasoning") {
      textParts.push(`## Reasoning\n${p.text}`);
    } else if (p.type === "source-url") {
      textParts.push(`## Source URL\n${p.url}`);
    } else if (p.type === "source-document") {
      textParts.push(`## Source Document\n${p.title}`);
    } else if (p.type === "file") {
      textParts.push(`## File\n${p.filename ?? p.url}`);
    } else if (p.type === "step-start") {
      // noop
    } else if (isToolLike(p)) {
      const toolName = p.type.startsWith("tool-")
        ? p.type.slice(5)
        : (p as DynamicToolUIPart).toolName;

      if (p.state === "input-streaming") {
        textParts.push(`## ${toolName}\nInput streaming...`);
      } else if (p.state === "input-available") {
        textParts.push(
          `## ${toolName}\n### Input\n${JSON.stringify(p.input).slice(0, 20)}...`,
        );
      } else if (p.state === "approval-requested") {
        textParts.push(`## ${toolName}\nApproval requested...`);
      } else if (p.state === "approval-responded") {
        textParts.push(`## ${toolName}\nApproval responded...`);
      } else if (p.state === "output-available") {
        textParts.push(
          p.output
            ? `## ${toolName}\nInput: ${JSON.stringify(p.input).slice(0, 40)}...\nOutput: ${JSON.stringify(p.output).slice(0, 40)}...`
            : `## ${toolName}\nInput: ${JSON.stringify(p.input).slice(0, 40)}...\nOutput: Tool responded with no output`,
        );
      } else if (p.state === "output-error") {
        textParts.push(
          p.errorText
            ? `## ${toolName}\nInput: ${JSON.stringify(p.input).slice(0, 40)}...\nError: ${p.errorText}`
            : `## ${toolName}\nInput: ${JSON.stringify(p.input).slice(0, 40)}...\nError: Tool responded with an error`,
        );
      } else if (p.state === "output-denied") {
        textParts.push(
          `## ${toolName}\nInput: ${JSON.stringify(p.input).slice(0, 40)}...\nOutput: Tool execution was denied`,
        );
      }
    }
  }

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

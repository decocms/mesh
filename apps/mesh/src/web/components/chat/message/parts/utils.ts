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

  let finalText = "";
  for (const p of msg.parts) {
    if (p.type === "text") {
      finalText += p.text + "\n";
    } else if (p.type === "reasoning") {
      finalText += `## Reasoning\n${p.text}\n\n`;
    } else if (p.type === "source-url") {
      finalText += `## Source URL\n${p.url}\n\n`;
    } else if (p.type === "source-document") {
      finalText += `## Source Document\n${p.title}\n\n`;
    } else if (p.type === "file") {
      finalText += `## File\n${p.filename ?? p.url}\n\n`;
    } else if (p.type === "step-start") {
      finalText += ``; // noop
    } else if (isToolLike(p)) {
      const toolName = p.type.startsWith("tool-")
        ? p.type.slice(5)
        : (p as DynamicToolUIPart).toolName;

      if (p.state === "input-streaming") {
        finalText += `## ${toolName}\nInput streaming...\n\n`;
      } else if (p.state === "input-available") {
        finalText += `## ${toolName}\n### Input\n${JSON.stringify(p.input).slice(0, 20)}...\n\n`;
      } else if (p.state === "approval-requested") {
        finalText += `## ${toolName}\nApproval requested...\n\n`;
      } else if (p.state === "approval-responded") {
        finalText += `## ${toolName}\nApproval responded...\n\n`;
      } else if (p.state === "output-available") {
        finalText += p.output
          ? `## ${toolName}\nInput: ${JSON.stringify(p.input).slice(0, 40)}...\nOutput: ${JSON.stringify(p.output).slice(0, 40)}...\n\n`
          : `## ${toolName}\nTool responded with no output\n\n`;
      } else if (p.state === "output-error") {
        finalText += p.errorText
          ? `## ${toolName}\nError: ${p.errorText}\n\n`
          : `## ${toolName}\nTool responded with an error\n\n`;
      } else if (p.state === "output-denied") {
        finalText += `## ${toolName}\nTool execution was denied\n\n`;
      }
    }
  }

  return finalText.length > 0 ? finalText : null;
}

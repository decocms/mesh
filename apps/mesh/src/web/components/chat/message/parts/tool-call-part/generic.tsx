"use client";

import type { ToolUIPart, DynamicToolUIPart } from "ai";
import { Atom02 } from "@untitledui/icons";
import { ToolCallShell } from "./common.tsx";
import { getFriendlyToolName } from "./utils.tsx";
import { getToolPartErrorText } from "../utils.ts";
import { useChat } from "../../../context.tsx";

interface GenericToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  /** Kept for backwards compatibility with assistant.tsx call sites (unused internally) */
  id?: string;
  isFirstInSequence?: boolean;
  isLastInSequence?: boolean;
  hasNextToolCall?: boolean;
}

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[Non-serializable value]";
  }
}

function getTitle(state: string, friendlyName: string): string {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return `Calling ${friendlyName}...`;
    case "output-available":
      return `Called ${friendlyName}`;
    case "output-error":
      return `Error calling ${friendlyName}`;
    default:
      return `Calling ${friendlyName}...`;
  }
}

function getSummary(state: string): string {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "Generating input";
    case "output-available":
      return "Tool answered";
    case "output-error":
      return "Tool failed";
    default:
      return "Calling tool";
  }
}

export function GenericToolCallPart({ part }: GenericToolCallPartProps) {
  const { isStreaming } = useChat();

  // Extract tool name with proper dynamic-tool handling
  const toolName =
    "toolName" in part && typeof part.toolName === "string"
      ? part.toolName
      : part.type === "dynamic-tool"
        ? "Dynamic Tool"
        : part.type.replace("tool-", "") || "Tool";
  const friendlyName = getFriendlyToolName(toolName);

  // Compute state-dependent props
  const title = getTitle(part.state, friendlyName);
  const summary = getSummary(part.state);

  // Build expanded content
  let detail = "";
  if (part.input !== undefined) {
    detail += "Input\n" + safeStringify(part.input);
  }

  if (part.state === "output-error") {
    const errorText = getToolPartErrorText(part);
    if (detail) detail += "\n\n";
    detail += "Error\n" + errorText;
  } else if (part.output !== undefined) {
    if (detail) detail += "\n\n";
    detail += "Output\n" + safeStringify(part.output);
  }

  return (
    <ToolCallShell
      icon={<Atom02 className="size-4 text-muted-foreground" />}
      title={title}
      usage={undefined}
      latencySeconds={undefined}
      summary={summary}
      status={part.state}
      isStreaming={isStreaming}
      detail={detail || null}
    />
  );
}

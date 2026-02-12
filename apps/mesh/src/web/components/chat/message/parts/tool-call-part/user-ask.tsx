"use client";

import { MessageQuestionCircle } from "@untitledui/icons";
import type { UserAskToolPart } from "../../../types.ts";
import { useChat } from "../../../context.tsx";
import { getToolPartErrorText } from "../utils.ts";
import { ToolCallShell } from "./common.tsx";

interface UserAskPartProps {
  part: UserAskToolPart;
  isFirstInSequence?: boolean;
  isLastInSequence?: boolean;
  hasNextToolCall?: boolean;
}

export function UserAskPart({ part }: UserAskPartProps) {
  const { isStreaming } = useChat();

  // Only render if state starts with "output-"
  if (!part.state.startsWith("output-")) {
    return null;
  }

  // Title: the question text with fallback
  const title = part.input?.prompt?.trim() || "Question";

  // Build the detail content and summary
  const summary: string =
    part.state === "output-denied"
      ? "Response was denied by the user"
      : part.state === "output-error"
        ? getToolPartErrorText(part)
        : (part.output?.response ?? "");

  return (
    <ToolCallShell
      icon={<MessageQuestionCircle className="size-4 text-muted-foreground" />}
      title={title}
      usage={undefined}
      latencySeconds={undefined}
      summary={summary}
      status={part.state}
      isStreaming={isStreaming}
      detail={`# Question\n${part.input?.prompt ?? ""}\n\n# Answer\n${summary}`}
    />
  );
}

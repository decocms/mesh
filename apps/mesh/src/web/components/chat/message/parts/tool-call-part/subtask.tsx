"use client";

import { GitBranch01 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { ToolCallShell } from "./common.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { useChat } from "../../../context.tsx";
import type { SubtaskToolPart } from "../../../types.ts";
import type { SubtaskResultMeta } from "@/api/routes/decopilot/built-in-tools/subtask";
import { extractTextFromOutput, getToolPartErrorText } from "../utils.ts";

interface SubtaskPartProps {
  part: SubtaskToolPart;
  isFirstInSequence?: boolean;
  isLastInSequence?: boolean;
  hasNextToolCall?: boolean;
}

export function SubtaskPart({
  part,
  isFirstInSequence,
  isLastInSequence,
  hasNextToolCall,
}: SubtaskPartProps) {
  const { virtualMcps, isStreaming } = useChat();

  // State computation
  const isInputStreaming =
    part.state === "input-streaming" || part.state === "input-available";
  const isOutputStreaming =
    part.state === "output-available" && part.preliminary === true;
  const isComplete = part.state === "output-available" && !part.preliminary;
  const isError = part.state === "output-error";

  // Agent lookup
  const agentId = part.input?.agent_id;
  const agent = agentId ? virtualMcps.find((v) => v.id === agentId) : null;

  // Usage extraction (only when complete)
  const subtaskMeta = isComplete
    ? (
        part.output?.metadata as
          | { subtaskResult?: SubtaskResultMeta }
          | undefined
      )?.subtaskResult
    : undefined;
  const usage = subtaskMeta?.usage;
  const tokens = usage && usage.totalTokens > 0 ? usage.totalTokens : undefined;

  // Title mapping
  const title: string = agent?.title
    ? agent.title
    : isInputStreaming
      ? "Starting subtask..."
      : isOutputStreaming
        ? "Subtask running..."
        : isComplete
          ? "Subtask completed"
          : isError
            ? "Subtask failed"
            : "Subtask";

  // Summary (task prompt)
  const summary = part.input?.prompt ?? "";

  // Detail (expanded content)
  const response = isError
    ? getToolPartErrorText(part)
    : (extractTextFromOutput(part.output) ?? "No output available");
  const detail = `# Task\n${part.input?.prompt ?? "No prompt provided"}\n\n# ${isError ? "Error" : "Execution"}\n${response}`;

  // Icon
  const icon = agent?.icon ? (
    <IntegrationIcon
      icon={agent.icon}
      name={agent.title ?? "Subtask"}
      size="2xs"
    />
  ) : (
    <GitBranch01 className="size-4 text-muted-foreground" />
  );

  return (
    <div
      className={cn(
        "relative",
        isFirstInSequence && "mt-2",
        isLastInSequence && "mb-2",
      )}
    >
      <ToolCallShell
        icon={icon}
        title={title}
        usage={tokens ? { tokens } : undefined}
        summary={summary}
        status={part.state}
        isStreaming={isStreaming}
        detail={detail}
      />
      {hasNextToolCall && (
        <div className="absolute left-[19px] top-full h-2 w-px bg-border/50" />
      )}
    </div>
  );
}

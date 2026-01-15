import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import type { ToolUIPart } from "ai";
import { useEffect, useState, type ReactNode } from "react";
import {
  Target04,
  Stars01,
  Lightbulb01,
  ChevronRight,
} from "@untitledui/icons";
import { MessageProps } from "./message-user.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";
import { ToolCallPart } from "./parts/tool-call-part.tsx";
import { UsageStats } from "./usage-stats.tsx";
import { MemoizedMarkdown } from "@deco/ui/components/chat/chat-markdown.tsx";

type ThinkingStage = "planning" | "thinking";

interface ThinkingStageConfig {
  icon: ReactNode;
  label: string;
}

const THINKING_STAGES: Record<ThinkingStage, ThinkingStageConfig> = {
  planning: {
    icon: (
      <Target04
        className="text-muted-foreground shrink-0 animate-pulse"
        size={14}
      />
    ),
    label: "Planning next moves",
  },
  thinking: {
    icon: (
      <Stars01
        className="text-muted-foreground shrink-0 animate-pulse"
        size={14}
      />
    ),
    label: "Thinking",
  },
};

const PLANNING_DURATION = 1200;

function TypingIndicator() {
  const [stage, setStage] = useState<ThinkingStage>("planning");

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const planningTimer = setTimeout(() => {
      setStage("thinking");
    }, PLANNING_DURATION);

    return () => {
      clearTimeout(planningTimer);
    };
  }, []);

  const config = THINKING_STAGES[stage];

  return (
    <div className="flex items-center gap-1.5 py-2 opacity-60">
      <span className="flex items-center gap-1.5">
        {config.icon}
        <span className="text-[15px] text-muted-foreground shimmer">
          {config.label}...
        </span>
      </span>
    </div>
  );
}

function ThoughtSummary({
  duration,
  parts,
  id,
}: {
  duration: number;
  parts: MessagePart[];
  id: string;
}) {
  const seconds = (duration / 1000).toFixed(1);
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Find reasoning parts to display
  const reasoningParts = parts.filter((part) => part.type === "reasoning");
  const isReasoningStreaming = reasoningParts.some(
    (part) => part.state === "streaming",
  );

  // Auto-expand when reasoning is streaming
  const shouldShowContent = isReasoningStreaming || isExpanded;

  return (
    <div className="flex flex-col mb-2">
      <button
        type="button"
        onClick={() => !isReasoningStreaming && setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "flex items-center gap-1.5 py-2 opacity-60 transition-opacity",
          !isReasoningStreaming && "cursor-pointer hover:opacity-100",
          isReasoningStreaming && "cursor-default",
        )}
      >
        <span className="flex items-center gap-1.5">
          {isReasoningStreaming ? (
            <Stars01
              className="text-muted-foreground shrink-0 shimmer"
              size={14}
            />
          ) : isHovered ? (
            <ChevronRight
              className={cn(
                "text-muted-foreground transition-transform shrink-0",
                isExpanded && "rotate-90",
              )}
              size={14}
            />
          ) : (
            <Lightbulb01 className="text-muted-foreground shrink-0" size={14} />
          )}
          <span
            className={cn(
              "text-[15px] text-muted-foreground",
              isReasoningStreaming && "shimmer",
            )}
          >
            {isReasoningStreaming ? "Thinking..." : `Thought for ${seconds}s`}
          </span>
        </span>
      </button>
      {shouldShowContent && (
        <div className="ml-[6px] border-l-2 pl-4 mt-1 mb-2 max-h-[300px] overflow-y-auto">
          {reasoningParts.map((part, index) => (
            <div
              key={`${id}-reasoning-${index}`}
              className="text-muted-foreground markdown-sm pb-2"
            >
              <MemoizedMarkdown
                id={`${id}-reasoning-${index}`}
                text={part.text}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type MessagePart = MessageProps<Metadata>["message"]["parts"][number];

interface MessagePartProps {
  part: MessagePart;
  id: string;
  usageStats?: ReactNode;
  isFollowedByToolCall?: boolean;
  isFirstToolCallInSequence?: boolean;
  isLastToolCallInSequence?: boolean;
  hasNextToolCall?: boolean;
}

function MessagePart({
  part,
  id,
  usageStats,
  isFollowedByToolCall,
  isFirstToolCallInSequence,
  isLastToolCallInSequence,
  hasNextToolCall,
}: MessagePartProps) {
  switch (part.type) {
    case "dynamic-tool":
      return (
        <ToolCallPart
          part={part}
          id={id}
          isFirstInSequence={isFirstToolCallInSequence}
          isLastInSequence={isLastToolCallInSequence}
          hasNextToolCall={hasNextToolCall}
        />
      );
    case "text":
      return (
        <MessageTextPart
          id={id}
          part={part}
          extraActions={usageStats}
          copyable
          hasToolCallAfter={isFollowedByToolCall}
        />
      );
    case "reasoning":
      // Don't render reasoning inline - it's shown in ThoughtSummary
      return null;
    case "step-start":
    case "file":
    case "source-url":
    case "source-document":
      return null;
    default: {
      if (part.type.startsWith("tool-")) {
        return (
          <ToolCallPart
            part={part as ToolUIPart}
            id={id}
            isFirstInSequence={isFirstToolCallInSequence}
            isLastInSequence={isLastToolCallInSequence}
            hasNextToolCall={hasNextToolCall}
          />
        );
      }
    }
  }

  throw new Error(`Unknown part type: ${part.type}`);
}

export function MessageAssistant<T extends Metadata>({
  message,
  status,
  className,
}: MessageProps<T>) {
  const { id, parts } = message;
  const isStreaming = status === "streaming";
  const isSubmitted = status === "submitted";
  const isLoading = isStreaming || isSubmitted;

  const hasContent = parts.length > 0;
  // Check if we have reasoning parts or if reasoning is currently streaming
  const hasReasoning = parts.some((part) => part.type === "reasoning");
  const isReasoningStreaming =
    isLoading &&
    parts.some(
      (part) => part.type === "reasoning" && part.state === "streaming",
    );
  // Show thought if we have reasoning parts OR if reasoning is currently streaming
  const reasoningStartAt = message.metadata?.reasoning_start_at
    ? new Date(message.metadata.reasoning_start_at)
    : null;
  const reasoningEndAt = message.metadata?.reasoning_end_at
    ? new Date(message.metadata.reasoning_end_at)
    : null;
  const duration =
    reasoningStartAt !== null
      ? (reasoningEndAt ?? new Date()).getTime() - reasoningStartAt.getTime()
      : null;
  const showThought =
    hasContent && (hasReasoning || isReasoningStreaming) && duration !== null;
  // Create usage stats component to pass to the last text part
  const usageStats = <UsageStats messages={[message]} />;

  return (
    <div
      className={cn(
        "w-full min-w-0 group relative flex items-start gap-4 px-4 z-20 text-foreground flex-row",
        className,
      )}
    >
      <div className="flex flex-col min-w-0 w-full items-start">
        <div className="w-full min-w-0 not-only:rounded-2xl text-[15px] wrap-break-word overflow-wrap-anywhere bg-transparent">
          {hasContent ? (
            <>
              {showThought && (
                <ThoughtSummary duration={duration} parts={parts} id={id} />
              )}
              {parts.map((part, index) => {
                const nextPart = parts[index + 1];
                const prevPart = parts[index - 1];
                const isFollowedByToolCall =
                  nextPart &&
                  (nextPart.type === "dynamic-tool" ||
                    nextPart.type.startsWith("tool-"));
                const isToolCall =
                  part.type === "dynamic-tool" || part.type.startsWith("tool-");
                const prevIsToolCall =
                  prevPart &&
                  (prevPart.type === "dynamic-tool" ||
                    prevPart.type.startsWith("tool-"));
                const nextIsToolCall =
                  nextPart &&
                  (nextPart.type === "dynamic-tool" ||
                    nextPart.type.startsWith("tool-"));

                const isFirstToolCallInSequence = isToolCall && !prevIsToolCall;
                const isLastToolCallInSequence = isToolCall && !nextIsToolCall;
                const hasNextToolCall = isToolCall && nextIsToolCall;

                return (
                  <MessagePart
                    key={`${id}-${index}`}
                    part={part}
                    id={id}
                    usageStats={
                      index === parts.length - 1 ? usageStats : undefined
                    }
                    isFollowedByToolCall={isFollowedByToolCall}
                    isFirstToolCallInSequence={isFirstToolCallInSequence}
                    isLastToolCallInSequence={isLastToolCallInSequence}
                    hasNextToolCall={hasNextToolCall}
                  />
                );
              })}
            </>
          ) : isLoading ? (
            <TypingIndicator />
          ) : null}
        </div>
      </div>
    </div>
  );
}

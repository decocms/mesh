import { cn } from "@deco/ui/lib/utils.ts";
import {
  ChevronRight,
  Lightbulb01,
  Stars01,
  Target04,
} from "@untitledui/icons";
import type { ToolUIPart, UIMessage } from "ai";
import { useEffect, useState, type ReactNode } from "react";
import { MemoizedMarkdown } from "../markdown.tsx";
import type { Metadata } from "../types.ts";
import { UsageStats } from "../usage-stats.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";
import { ToolCallPart } from "./parts/tool-call-part.tsx";

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
  parts: ReasoningPart[];
  id: string;
}) {
  const seconds = (duration / 1000).toFixed(1);
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Parts are already filtered to reasoning parts
  const isReasoningStreaming = parts.some((part) => part.state === "streaming");

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
          {parts.map((part, index) => (
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

type MessagePart = UIMessage<Metadata>["parts"][number];

type ReasoningPart = Extract<MessagePart, { type: "reasoning" }>;

function isReasoningPart(part: MessagePart): part is ReasoningPart {
  return part.type === "reasoning";
}

interface MessageAssistantProps<T extends Metadata> {
  message: UIMessage<T> | null;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
}

interface MessagePartProps {
  part: MessagePart;
  id: string;
  usageStats?: ReactNode;
  isFollowedByToolCall?: boolean;
  isFirstToolCallInSequence?: boolean;
  isLastToolCallInSequence?: boolean;
  hasNextToolCall?: boolean;
}

function isToolCallPart(part: MessagePart | null | undefined): boolean {
  return Boolean(
    part?.type === "dynamic-tool" || part?.type?.startsWith("tool-"),
  );
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

function EmptyAssistantState() {
  return (
    <div className="text-[15px] text-muted-foreground/60 py-2">
      No response was generated
    </div>
  );
}

function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 group relative flex items-start gap-4 px-4 z-20 text-foreground flex-row",
        className,
      )}
    >
      <div className="flex flex-col min-w-0 w-full items-start">
        <div className="w-full min-w-0 not-only:rounded-2xl text-[15px] wrap-break-word overflow-wrap-anywhere bg-transparent">
          {children}
        </div>
      </div>
    </div>
  );
}

export function MessageAssistant<T extends Metadata>({
  message,
  status,
  className,
}: MessageAssistantProps<T>) {
  const isStreaming = status === "streaming";
  const isSubmitted = status === "submitted";
  const isLoading = isStreaming || isSubmitted;

  // Handle null message or empty parts
  const hasContent = message !== null && message.parts.length > 0;

  // Reasoning logic (only when message exists)
  const reasoningParts = message?.parts?.filter(isReasoningPart) ?? [];
  const hasReasoning = reasoningParts.length > 0;

  const reasoningStartAt = message?.metadata?.reasoning_start_at
    ? new Date(message.metadata.reasoning_start_at)
    : null;
  const reasoningEndAt = message?.metadata?.reasoning_end_at
    ? new Date(message.metadata.reasoning_end_at)
    : new Date();

  const duration =
    reasoningStartAt !== null
      ? reasoningEndAt.getTime() - reasoningStartAt.getTime()
      : null;

  return (
    <Container className={className}>
      {hasContent ? (
        <>
          {hasReasoning && duration !== null && (
            <ThoughtSummary
              duration={duration}
              parts={reasoningParts}
              id={message.id}
            />
          )}
          {message.parts.map((part, index) => {
            const isLast = index === message.parts.length - 1;
            const nextPart = message.parts[index + 1];
            const prevPart = message.parts[index - 1];

            const isToolCall = isToolCallPart(part);
            const prevIsToolCall = isToolCallPart(prevPart);
            const nextIsToolCall = isToolCallPart(nextPart);

            const isFirstToolCallInSequence = isToolCall && !prevIsToolCall;
            const isLastToolCallInSequence = isToolCall && !nextIsToolCall;
            const hasNextToolCall = isToolCall && nextIsToolCall;

            return (
              <MessagePart
                key={`${message.id}-${index}`}
                part={part}
                id={message.id}
                usageStats={isLast && <UsageStats messages={[message]} />}
                isFollowedByToolCall={nextIsToolCall}
                isFirstToolCallInSequence={isFirstToolCallInSequence}
                isLastToolCallInSequence={isLastToolCallInSequence}
                hasNextToolCall={hasNextToolCall}
              />
            );
          })}
        </>
      ) : isLoading ? (
        <TypingIndicator />
      ) : (
        <EmptyAssistantState />
      )}
    </Container>
  );
}

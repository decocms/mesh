import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import type { ToolUIPart } from "ai";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Target04, Stars01, Lightbulb01 } from "@untitledui/icons";
import { MessageProps } from "./message-user.tsx";
import { MessageReasoningPart } from "./parts/reasoning-part.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";
import { ToolCallPart } from "./parts/tool-call-part.tsx";
import { UsageStats } from "./usage-stats.tsx";

type ThinkingStage = "planning" | "thinking";

interface ThinkingStageConfig {
  icon: ReactNode;
  label: string;
}

const THINKING_STAGES: Record<ThinkingStage, ThinkingStageConfig> = {
  planning: {
    icon: (
      <Target04 className="text-muted-foreground animate-pulse" size={20} />
    ),
    label: "Planning next moves",
  },
  thinking: {
    icon: <Stars01 className="text-muted-foreground animate-pulse" size={20} />,
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
    <div className="flex items-center gap-2 py-2">
      {config.icon}
      <span className="text-sm font-medium text-muted-foreground text-shimmer">
        {config.label}...
      </span>
    </div>
  );
}

function ThoughtSummary({ duration }: { duration: number }) {
  const seconds = (duration / 1000).toFixed(1);

  return (
    <div className="flex items-center gap-2 py-2 opacity-60">
      <Lightbulb01 className="text-muted-foreground" size={16} />
      <span className="text-xs text-muted-foreground">
        Thought · {seconds}s
      </span>
    </div>
  );
}

type MessagePart = MessageProps<Metadata>["message"]["parts"][number];

interface MessagePartProps {
  part: MessagePart;
  id: string;
  usageStats?: ReactNode;
}

function MessagePart({ part, id, usageStats }: MessagePartProps) {
  switch (part.type) {
    case "dynamic-tool":
      return <ToolCallPart part={part} id={id} />;
    case "text":
      return (
        <MessageTextPart
          id={id}
          part={part}
          extraActions={usageStats}
          copyable
        />
      );
    case "reasoning":
      return <MessageReasoningPart part={part} id={id} />;
    case "step-start":
    case "file":
    case "source-url":
    case "source-document":
      return null;
    default: {
      if (part.type.startsWith("tool-")) {
        return <ToolCallPart part={part as ToolUIPart} id={id} />;
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

  const startTimeRef = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | null>(() => {
    const stored = localStorage.getItem(`msg-duration-${id}`);
    return stored ? Number(stored) : null;
  });

  // Capture startTime when loading begins (first time isLoading becomes true)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (isLoading && startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
  }, [isLoading]);

  // Calculate duration when first part arrives (thinking time, not writing time)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (
      parts.length > 0 &&
      duration === null &&
      startTimeRef.current !== null
    ) {
      const calculatedDuration = Date.now() - startTimeRef.current;
      setDuration(calculatedDuration);
      // Save to localStorage for persistence
      localStorage.setItem(`msg-duration-${id}`, calculatedDuration.toString());
    }
  }, [parts.length, duration, id]);

  const hasContent = parts.length > 0;
  const showThought = hasContent && !isLoading && duration !== null;

  // Create usage stats component to pass to the last text part
  const usageStats = <UsageStats messages={[message]} />;

  return (
    <div
      className={cn(
        "w-full min-w-0 group relative flex items-start gap-4 px-4 z-20 text-foreground flex-row",
        className,
      )}
    >
      <div className="flex flex-col gap-2 min-w-0 w-full items-start">
        <div className="w-full min-w-0 not-only:rounded-2xl text-sm wrap-break-word overflow-wrap-anywhere bg-transparent">
          {hasContent ? (
            <>
              {showThought && <ThoughtSummary duration={duration} />}
              {parts.map((part, index) => (
                <MessagePart
                  key={`${id}-${index}`}
                  part={part}
                  id={id}
                  usageStats={
                    index === parts.length - 1 ? usageStats : undefined
                  }
                />
              ))}
            </>
          ) : isLoading ? (
            <TypingIndicator />
          ) : null}
        </div>
      </div>
    </div>
  );
}

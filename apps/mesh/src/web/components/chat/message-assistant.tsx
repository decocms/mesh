import { cn } from "@deco/ui/lib/utils.ts";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import type { ToolUIPart } from "ai";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useEffect, useRef, useState } from "react";
import { MessageProps } from "./message-user.tsx";
import { MessageReasoningPart } from "./parts/reasoning-part.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";
import { ToolCallPart } from "./parts/tool-call-part.tsx";

type ThinkingStage = "planning" | "thinking";

interface ThinkingStageConfig {
  icon: string;
  label: string;
}

const THINKING_STAGES: Record<ThinkingStage, ThinkingStageConfig> = {
  planning: {
    icon: "track_changes",
    label: "Planning next moves",
  },
  thinking: {
    icon: "psychology",
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
      <Icon
        name={config.icon}
        className="text-muted-foreground animate-pulse"
        size={20}
      />
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
      <Icon name="lightbulb" className="text-muted-foreground" size={16} />
      <span className="text-xs text-muted-foreground">
        Thought · {seconds}s
      </span>
    </div>
  );
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

  // Calculate duration when loading finishes
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!isLoading && duration === null && parts.length > 0 && startTimeRef.current !== null) {
      const calculatedDuration = Date.now() - startTimeRef.current;
      setDuration(calculatedDuration);
      // Save to localStorage for persistence
      localStorage.setItem(`msg-duration-${id}`, calculatedDuration.toString());
    }
  }, [isLoading, duration, parts.length, id]);

  const hasContent = parts.length > 0;
  const showThought = hasContent && !isLoading && duration !== null;

  return (
    <div
      className={cn(
        "w-full min-w-0 group relative flex items-start gap-4 px-8 z-20 text-foreground flex-row",
        className,
      )}
    >

      <div className="flex flex-col gap-2 min-w-0 w-full items-start">
        <div className="w-full min-w-0 not-only:rounded-2xl text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-transparent">
          {hasContent ? (
            parts.map((part, index) => {
              if (part.type === "text") {
                return (
                  <>
                  {showThought && <ThoughtSummary duration={duration} />}
                  <MessageTextPart
                    key={`${id}-${index}`}
                    id={id}
                    text={part.text}
                    copyable={true}
                  />
                  </>
                );
              }
              if (part.type === "reasoning") {
                return (
                  <MessageReasoningPart
                    key={`${id}-${index}`}
                    part={part}
                    id={id}
                  />
                );
              }
              if (part.type.startsWith("tool-")) {
                return (
                  <ToolCallPart
                    key={`${id}-${index}`}
                    part={part as ToolUIPart}
                    id={id}
                  />
                );
              }
              return null;
            })
          ) : isLoading ? (
            <TypingIndicator />
          ) : null}
        </div>
      </div>
    </div>
  );
}

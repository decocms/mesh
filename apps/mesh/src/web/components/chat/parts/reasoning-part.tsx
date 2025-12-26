import { ReasoningUIPart } from "ai";
import { useEffect, useReducer } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Stars01, ChevronDown } from "@untitledui/icons";
import { MemoizedMarkdown } from "@deco/ui/components/chat/chat-markdown.tsx";

interface ReasoningPartProps {
  part: ReasoningUIPart;
  id: string;
}

interface State {
  isExpanded: boolean;
  wasManuallyToggled: boolean;
}

type Action = { type: "TOGGLE" } | { type: "SET_EXPANDED"; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "TOGGLE":
      return {
        isExpanded: !state.isExpanded,
        wasManuallyToggled: true,
      };
    case "SET_EXPANDED":
      if (state.wasManuallyToggled) {
        return state;
      }
      return {
        ...state,
        isExpanded: action.payload,
      };
    default:
      return state;
  }
}

export function MessageReasoningPart({ part, id }: ReasoningPartProps) {
  const { state: partState } = part;
  const isPartStreaming = partState === "streaming";

  const [{ isExpanded }, dispatch] = useReducer(reducer, {
    isExpanded: false,
    wasManuallyToggled: false,
  });

  // Handle automatic expansion/collapse based on streaming states
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    dispatch({ type: "SET_EXPANDED", payload: isPartStreaming });
  }, [isPartStreaming]);

  const handleToggle = () => {
    dispatch({ type: "TOGGLE" });
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 py-2 transition-colors cursor-pointer"
      >
        <Stars01
          className={cn(
            "text-muted-foreground transition-opacity",
            isPartStreaming && "animate-pulse",
          )}
        />
        <span
          className={cn(
            "text-sm font-medium text-muted-foreground",
            isPartStreaming && "text-shimmer",
          )}
        >
          Agent thinking
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            isExpanded ? "rotate-180" : "",
          )}
        />
      </button>
      <div
        className={cn(
          "transition-all duration-200 ease-in-out",
          isExpanded
            ? isPartStreaming
              ? "max-h-[400px] opacity-100"
              : "max-h-[200px] opacity-80"
            : "max-h-0 opacity-0 overflow-hidden",
        )}
      >
        <div
          className={cn(
            "border-l-2 pl-4 overflow-y-auto",
            isPartStreaming ? "max-h-[400px]" : "max-h-[200px]",
          )}
        >
          <div className={cn("text-muted-foreground markdown-sm pb-2")}>
            <MemoizedMarkdown id={id} text={part.text} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import { AlertCircle, ChevronRight, GitBranch01 } from "@untitledui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { MemoizedMarkdown } from "../../markdown.tsx";
import type { SubtaskToolPart } from "../../types.ts";
import { extractTextFromOutput, getToolPartErrorText } from "./utils.ts";

export function SubtaskPart({ part }: { part: SubtaskToolPart }) {
  const isStreaming =
    part.state === "input-streaming" || part.state === "input-available";
  const isOutputStreaming =
    part.state === "output-available" && part.preliminary === true;
  const isComplete = part.state === "output-available" && !part.preliminary;
  const isError = part.state === "output-error";

  const text = extractTextFromOutput(part.output);
  const prompt = part.input?.prompt;
  const agentId = part.input?.agent_id;
  const partId = part.toolCallId ?? agentId ?? "unknown";

  // Auto-expand while streaming, collapsible when complete
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="flex flex-col w-full min-w-0">
      <Collapsible
        open={isComplete ? isExpanded : true}
        onOpenChange={isComplete ? setIsExpanded : () => {}}
      >
        <div className="border border-border/75 rounded-lg flex flex-col bg-accent/5 w-full min-w-0 overflow-hidden">
          {/* ── Header ── */}
          <CollapsibleTrigger
            className={cn(
              "flex items-center gap-2 w-full p-3 transition-colors",
              isComplete && "cursor-pointer hover:bg-accent/50",
              !isComplete && "cursor-default",
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <GitBranch01
                className={cn(
                  "size-4 shrink-0",
                  isError && "text-destructive",
                  isStreaming && "text-muted-foreground shimmer",
                  isOutputStreaming && "text-muted-foreground animate-pulse",
                  isComplete && "text-muted-foreground",
                )}
                size={16}
              />
              <div className="flex flex-col min-w-0">
                <span
                  className={cn(
                    "text-[13px] font-medium truncate",
                    isError && "text-destructive/90",
                    (isStreaming || isOutputStreaming) &&
                      "text-muted-foreground shimmer",
                    isComplete && "text-muted-foreground",
                  )}
                >
                  {isStreaming && "Starting subtask..."}
                  {isOutputStreaming && "Subtask running..."}
                  {isComplete && "Subtask completed"}
                  {isError && "Subtask failed"}
                  {!isStreaming &&
                    !isOutputStreaming &&
                    !isComplete &&
                    !isError &&
                    "Subtask"}
                </span>
                {prompt && (
                  <span className="text-xs text-muted-foreground/75 truncate">
                    {agentId && (
                      <span className="font-medium">{agentId}: </span>
                    )}
                    {prompt}
                  </span>
                )}
              </div>
            </div>
            {isComplete && (
              <ChevronRight
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200 shrink-0",
                  isExpanded && "rotate-90",
                )}
              />
            )}
          </CollapsibleTrigger>

          {/* ── Body ── */}
          <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
            <div className="px-3 pb-3 pt-0">
              <div className="border-t border-border/50 pt-3">
                {/* Subagent text output */}
                {text && (
                  <div
                    className={cn(
                      "text-[14px] text-foreground/90",
                      isOutputStreaming && "shimmer",
                    )}
                  >
                    <MemoizedMarkdown
                      id={`subtask-${partId}-output`}
                      text={text}
                    />
                  </div>
                )}

                {/* Streaming with no text yet */}
                {!text && (isStreaming || isOutputStreaming) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground shimmer">
                    <span>Agent is working...</span>
                  </div>
                )}

                {/* Error state */}
                {isError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{getToolPartErrorText(part, "Subtask failed")}</span>
                  </div>
                )}

                {/* ── Footer slot (Plan 5: usage stats) ── */}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

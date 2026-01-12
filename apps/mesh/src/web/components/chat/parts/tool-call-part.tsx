import { AlertCircle, Terminal, ChevronRight, Atom02 } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { ToolOutputRenderer } from "./tool-outputs/tool-output-renderer.tsx";
import { useState } from "react";
import { MonacoCodeEditor } from "../../details/workflow/components/monaco-editor.tsx";
import { useDeveloperMode } from "@/web/hooks/use-developer-mode.ts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";

interface ToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  id: string;
  isFirstInSequence?: boolean;
  isLastInSequence?: boolean;
  hasNextToolCall?: boolean;
}

/**
 * Convert a tool name to a friendly display name
 * Converts SCREAMING_SNAKE_CASE or snake_case to Title Case
 */
function getFriendlyToolName(toolName: string): string {
  return toolName
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function ToolCallPart({
  part,
  isFirstInSequence = false,
  isLastInSequence = false,
  hasNextToolCall = false,
}: ToolCallPartProps) {
  const { state } = part;
  const toolName =
    "toolName" in part ? part.toolName : part.type.replace("tool-", "");
  const friendlyName = getFriendlyToolName(toolName);
  const [isExpanded, setIsExpanded] = useState(false);
  const [developerMode] = useDeveloperMode();

  const showInput =
    (state === "input-streaming" ||
      state === "input-available" ||
      state === "output-available") &&
    !!part.input;
  const showOutput = state === "output-available";
  const showError = state === "output-error";

  // Business user mode - simple inline text like Thinking indicator
  if (!developerMode) {
    const isStreaming =
      state === "input-streaming" || state === "input-available";
    const isComplete = state === "output-available";
    const isError = state === "output-error";

    return (
      <div
        className={cn(
          "flex items-center gap-1.5 py-2 opacity-75 relative",
          isFirstInSequence && "mt-2",
          isLastInSequence && "mb-2",
        )}
      >
        <div className="relative shrink-0 flex items-center">
          <Atom02 className="size-4 text-muted-foreground shrink-0" />
          {hasNextToolCall && (
            <div
              className="absolute left-1/2 top-full w-px bg-border -translate-x-1/2"
              style={{ height: "calc(100% + 1rem)" }}
            />
          )}
        </div>
        <span className="text-[15px]">
          {isStreaming && (
            <>
              <span className="text-muted-foreground shimmer">Calling</span>{" "}
              <span className="text-muted-foreground/75 shimmer">
                {friendlyName}...
              </span>
            </>
          )}
          {isComplete && (
            <>
              <span className="text-muted-foreground">Called</span>{" "}
              <span className="text-muted-foreground/75">{friendlyName}</span>
            </>
          )}
          {isError && (
            <>
              <span className="text-destructive/90">Error calling</span>{" "}
              <span className="text-destructive/75">{friendlyName}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  // Developer mode - expandable box with JSON details
  return (
    <div className="flex flex-col my-4 w-full min-w-0">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Header - always cheap to render */}
        <div className="border border-border/75 rounded-lg flex flex-col bg-background w-full min-w-0 overflow-hidden">
          <CollapsibleTrigger className="flex items-center gap-2 w-full cursor-pointer p-3 hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {state === "output-error" ? (
                <AlertCircle className="size-4 text-destructive shrink-0" />
              ) : (
                <Terminal
                  className={cn(
                    "size-4 text-muted-foreground shrink-0",
                    (state === "input-streaming" ||
                      state === "input-available") &&
                      "shimmer",
                  )}
                />
              )}
              <span
                className={cn(
                  "text-[15px] font-medium text-muted-foreground truncate",
                  state === "output-error" && "text-destructive/90",
                  (state === "input-streaming" ||
                    state === "input-available") &&
                    "shimmer",
                )}
              >
                {state === "input-streaming" &&
                  `Streaming ${toolName} arguments`}
                {state === "input-available" && `Calling ${toolName}`}
                {state === "output-available" && `Called ${toolName}`}
                {state === "output-error" && `Error calling ${toolName}`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ChevronRight
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
            </div>
          </CollapsibleTrigger>

          {/* Heavy content - animated expand/collapse */}
          <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
            <div className="flex ml-[7px] px-3 pb-3">
              <div className="w-4 relative shrink-0">
                <div className="absolute left-0 top-0 bottom-0 w-0.25 bg-border" />
              </div>

              <div className="flex flex-col gap-4 flex-1 min-w-0 pt-2">
                {showInput && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        Input
                      </span>
                    </div>
                    <div className="border border-border rounded-lg p-2 h-full max-h-[200px]">
                      <MonacoCodeEditor
                        code={JSON.stringify(part.input, null, 2)}
                        language="json"
                        foldOnMount={true}
                        height="100%"
                        readOnly={true}
                      />
                    </div>
                  </div>
                )}

                {/* Output */}
                {showOutput && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        Output
                      </span>
                    </div>
                    <div className="border border-border rounded-lg max-h-[200px] overflow-auto p-2 h-full">
                      <ToolOutputRenderer output={part.output} />
                    </div>
                  </div>
                )}

                {/* Error */}
                {showError && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-destructive/90">
                        Error
                      </span>
                    </div>
                    <div className="border border-destructive/20 rounded-lg max-h-[200px] overflow-auto p-2 bg-destructive/10">
                      <pre className="text-xs font-mono text-destructive whitespace-pre-wrap wrap-break-word">
                        {"errorText" in part &&
                        typeof part.errorText === "string"
                          ? part.errorText
                          : "An unknown error occurred"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

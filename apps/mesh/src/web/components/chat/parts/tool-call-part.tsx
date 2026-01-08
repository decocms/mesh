import { AlertCircle, Terminal, ChevronRight } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { ToolOutputRenderer } from "./tool-outputs/tool-output-renderer.tsx";
import { useState } from "react";
import { MonacoCodeEditor } from "../../details/workflow/components/monaco-editor.tsx";

interface ToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  id: string;
}

export function ToolCallPart({ part }: ToolCallPartProps) {
  const { state } = part;
  const toolName =
    "toolName" in part ? part.toolName : part.type.replace("tool-", "");
  const [isExpanded, setIsExpanded] = useState(false);

  const showInput =
    (state === "input-streaming" ||
      state === "input-available" ||
      state === "output-available") &&
    !!part.input;
  const showOutput = state === "output-available";
  const showError = state === "output-error";

  return (
    <div className="flex flex-col my-4 w-full min-w-0">
      {/* Header - always cheap to render */}
      <div className="border border-border/75 rounded-lg flex flex-col bg-background w-full min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 w-full cursor-pointer p-3"
        >
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
                "text-xs font-medium text-muted-foreground truncate",
                state === "output-error" && "text-destructive/90",
                (state === "input-streaming" || state === "input-available") &&
                  "shimmer",
              )}
            >
              {state === "input-streaming" && `Streaming ${toolName} arguments`}
              {state === "input-available" && `Calling ${toolName}`}
              {state === "output-available" && `Called ${toolName}`}
              {state === "output-error" && `Error calling ${toolName}`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ChevronRight
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </div>
        </button>

        {/* Heavy content - only render when expanded */}
        {isExpanded && (
          <div className="flex ml-[7px] px-3 pb-3">
            <div className="w-4 relative shrink-0">
              <div className="absolute left-0 top-0 bottom-0 w-0.25 bg-border" />
            </div>

            <div className="flex flex-col gap-4 flex-1 min-w-0 pt-2">
              {/* Input: cheap <pre> during streaming, syntax highlighter after */}
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
                  <div className="border border-border rounded-lg max-h-[200px] overflow-auto p-2">
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
                      {"errorText" in part && typeof part.errorText === "string"
                        ? part.errorText
                        : "An unknown error occurred"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

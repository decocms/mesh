import { AlertCircle, Terminal, ChevronRight } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { ToolOutputRenderer } from "./tool-outputs/tool-output-renderer.tsx";
import { Spinner } from "@deco/ui/components/spinner.js";
import { useState } from "react";
import { JsonSyntaxHighlighter } from "../../json-syntax-highlighter.tsx";

interface ToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  id: string;
}

export function ToolCallPart({ part }: ToolCallPartProps) {
  const { state } = part;
  const toolName =
    "toolName" in part ? part.toolName : part.type.replace("tool-", "");
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="flex flex-col my-4 w-full min-w-0">
      {/* Header */}
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
              <Terminal className="size-4 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                "text-xs font-medium text-muted-foreground truncate",
                state === "output-error" && "text-destructive/90",
              )}
            >
              {state === "input-streaming" && `Streaming ${toolName} arguments`}
              {state === "input-available" && `Calling ${toolName}`}
              {state === "output-available" && `Called ${toolName}`}
              {state === "output-error" && `Error calling ${toolName}`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(state === "input-streaming" || state === "input-available") && (
              <Spinner size="xs" />
            )}
            <ChevronRight
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </div>
        </button>

        {/* Content with animation */}
        <div
          className={cn(
            "transition-all duration-200 ease-in-out overflow-hidden",
            isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="flex gap-2 ml-[7px] px-3 pb-3">
            {/* Left border line */}
            <div className="w-4 relative shrink-0">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-border" />
            </div>

            {/* Input and Output sections */}
            <div className="flex flex-col gap-4 flex-1 min-w-0 pt-2">
              {/* Input Section */}
              {(state === "input-streaming" ||
                state === "input-available" ||
                state === "output-available") &&
                !!part.input && (
                  <div className="flex flex-col gap-0.5">
                    <div className="px-1 h-5 flex items-center">
                      <span className="text-xs font-medium text-muted-foreground">
                        Input
                      </span>
                    </div>
                    <div className="border border-border rounded-lg max-h-[200px] overflow-auto p-2">
                      <JsonSyntaxHighlighter
                        jsonString={JSON.stringify(part.input, null, 2)}
                        padding="0"
                      />
                    </div>
                  </div>
                )}

              {/* Output Section */}
              {state === "output-available" && (
                <div className="flex flex-col gap-0.5">
                  <div className="px-1 h-5 flex items-center">
                    <span className="text-xs font-medium text-muted-foreground">
                      Output
                    </span>
                  </div>
                  <div className="border border-border rounded-lg max-h-[200px] overflow-auto p-2">
                    <ToolOutputRenderer
                      toolName={toolName}
                      input={part.input}
                      output={part.output}
                    />
                  </div>
                </div>
              )}

              {/* Error Section */}
              {state === "output-error" && (
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
        </div>
      </div>
    </div>
  );
}

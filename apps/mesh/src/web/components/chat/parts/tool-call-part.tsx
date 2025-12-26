import { AlertCircle, Terminal } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { ToolOutputRenderer } from "./tool-outputs/tool-output-renderer.tsx";

interface ToolCallPartProps {
  part: ToolUIPart | DynamicToolUIPart;
  id: string;
}

export function ToolCallPart({ part }: ToolCallPartProps) {
  const { state } = part;
  const toolName =
    "toolName" in part ? part.toolName : part.type.replace("tool-", "");

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {state === "output-error" ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Terminal className="h-3.5 w-3.5" />
        )}
        <span className={cn(state === "output-error" && "text-destructive/90")}>
          {state === "input-streaming" && `Streaming ${toolName} arguments...`}
          {state === "input-available" && `Calling ${toolName}...`}
          {state === "output-available" && `Called ${toolName}`}
          {state === "output-error" && `Error calling ${toolName}`}
        </span>
        {(state === "input-streaming" || state === "input-available") && (
          <span className="animate-pulse">...</span>
        )}
      </div>

      <div
        className={cn(
          "transition-all duration-200 ease-in-out",
          "border-l-2 pl-3",
          state === "output-error" ? "border-destructive/50" : "border-border",
        )}
      >
        {(state === "input-streaming" || state === "input-available") &&
          !!part.input && (
            <div className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded">
              {JSON.stringify(part.input, null, 2)}
            </div>
          )}

        {state === "output-available" && (
          <ToolOutputRenderer
            toolName={toolName}
            input={part.input}
            output={part.output}
          />
        )}

        {state === "output-error" && (
          <div className="text-xs font-mono bg-destructive/10 text-destructive p-2 rounded border border-destructive/20">
            {"errorText" in part && typeof part.errorText === "string"
              ? part.errorText
              : "An unknown error occurred"}
          </div>
        )}
      </div>
    </div>
  );
}

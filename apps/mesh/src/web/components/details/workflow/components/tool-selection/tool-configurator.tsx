import { Loader2 } from "lucide-react";
import { ToolComponent } from "../tool-selector";
import { useTool } from "../tool-selector";
import { useToolInput } from "./hooks/use-tool-input";
import type { ToolStep } from "../types";
import type { McpTool } from "@/web/hooks/use-mcp";

export function ToolConfigurator({ step }: { step: ToolStep }) {
  const { tool, mcp, connection } = useTool(
    step?.action?.toolName ?? "",
    step?.action?.connectionId ?? "",
  );
  const { mentions, handleInputChange } = useToolInput(step);

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="overflow-scroll h-full">
      <ToolComponent
        tool={tool as McpTool}
        connection={connection}
        onInputChange={handleInputChange}
        initialInputParams={step?.input ?? {}}
        mentions={mentions}
        mcp={mcp}
      />
    </div>
  );
}

import { Loader2, SlidersHorizontal } from "lucide-react";
import { ToolComponent, useTool } from "../tool-selector";
import { useToolInput } from "./hooks/use-tool-input";
import type { ToolStep } from "../types";
import type { McpTool } from "@/web/hooks/use-mcp";
import type { JsonSchema } from "@/web/utils/constants";
import {
  OutputSchema,
  OutputSchemaProvider,
  useOutputSchemaSelection,
} from "../output-schema/index.ts";
import {
  ResizableHandle,
  ResizablePanel,
} from "@deco/ui/components/resizable.js";
import { ResizablePanelGroup } from "@deco/ui/components/resizable.js";
import { ScrollArea } from "@deco/ui/components/scroll-area.js";
import {
  useTrackingExecutionId,
  useWorkflowActions,
} from "../../stores/workflow.tsx";
import { MonacoCodeEditor } from "../monaco-editor.tsx";
import { ToolCallAction } from "@decocms/bindings/workflow";
import { useTransformCodeSync } from "../output-schema/hooks/use-transform-code-sync.ts";
import { PANELS } from "../../stores/panels.ts";

export function ToolStep({ step }: { step: ToolStep }) {
  const trackingExecutionId = useTrackingExecutionId();
  const { tool, mcp, connection } = useTool(
    step?.action?.toolName ?? "",
    step?.action?.connectionId ?? "",
  );
  const { mentions, handleInputChange } = useToolInput(step);

  const { updateStep } = useWorkflowActions();

  const transformCode =
    (step?.action as ToolCallAction)?.transformCode ??
    getDefaultTransformCode();

  const handleCodeSave = (
    value: string,
    outputSchema: JsonSchema | undefined,
  ) => {
    if (!step) return;
    const action = step.action as ToolCallAction;
    updateStep(step.name, {
      action: {
        ...action,
        transformCode: value,
      },
      outputSchema,
    });
  };

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const outputSchema = tool.outputSchema as JsonSchema | undefined;

  return (
    <ResizablePanelGroup direction="vertical">
      {PANELS.step.panels.map((panel) => {
        if (panel.name === "Input") {
          return (
            <ResizablePanel order={1} className="mask-b-from-95% pb-1">
              <ScrollArea hideScrollbar className="h-full">
                <ToolComponent
                  tool={tool as McpTool}
                  connection={connection}
                  onInputChange={handleInputChange}
                  initialInputParams={step?.input ?? {}}
                  mentions={mentions}
                  mcp={mcp}
                />
              </ScrollArea>
            </ResizablePanel>
          );
        }
        if (panel.name === "Output Config") {
          return (
            <ResizablePanel className="flex-1">
              <OutputSchemaProvider schema={outputSchema}>
                <OutputSchemaSection />
              </OutputSchemaProvider>
            </ResizablePanel>
          );
        }
        if (panel.name === "Transform Code") {
          <ResizablePanel className="flex-1">
            <MonacoCodeEditor
              code={transformCode}
              language="typescript"
              onSave={(value, outputSchema) =>
                handleCodeSave(value, outputSchema ?? undefined)
              }
              height="100%"
            />
          </ResizablePanel>;
        }
        return null;
      })}
    </ResizablePanelGroup>
  );
}

function OutputSchemaSection() {
  const { selectedCount } = useOutputSchemaSelection();
  const { syncInputInterface } = useTransformCodeSync();

  return (
    <div className="w-full h-full flex flex-col">
      <div className="h-10 flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-primary/10 flex items-center justify-center">
            <SlidersHorizontal className="h-3 w-3 text-primary" />
          </div>
          <span className="font-medium text-sm">Output</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={syncInputInterface}
            className="text-xs text-primary hover:underline"
            title="Update Input interface from selected properties"
          >
            Sync Input
          </button>
        </div>
      </div>
      <div className="p-2 flex-1 overflow-auto">
        <OutputSchema.Root className="gap-0.5" />
      </div>
    </div>
  );
}

function getDefaultTransformCode(): string {
  return `interface Input {}

export default function(input: Input) {
  return input;
}`;
}

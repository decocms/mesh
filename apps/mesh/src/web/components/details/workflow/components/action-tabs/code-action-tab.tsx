import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.js";
import { usePollingWorkflowExecution } from "../../hooks/use-workflow-collection-item";
import {
  useTrackingExecutionId,
  useWorkflowActions,
} from "../../stores/workflow";
import { MonacoCodeEditor } from "../monaco-editor";
import { ExecutionResult } from "../tool-selector";
import type { CodeStep } from "../types";

export function CodeActionTab({ step }: { step: CodeStep }) {
  const { updateStep } = useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();
  const { step_results } = usePollingWorkflowExecution(trackingExecutionId);
  const stepResult = step_results?.find(
    (result) => result.step_id === step.name,
  );

  const output = stepResult?.output;
  const error = stepResult?.error as string | undefined;
  const result = output ? output : { error };
  return (
    <ResizablePanelGroup direction="vertical" className="h-full">
      <ResizablePanel order={1} className="flex-1">
        <MonacoCodeEditor
          key={`code-${step.name}`}
          height="100%"
          code={step.action.code}
          readOnly={!!trackingExecutionId}
          language="typescript"
          onSave={
            trackingExecutionId
              ? undefined
              : (code, outputSchema) => {
                  updateStep(step.name, {
                    action: { ...step.action, code },
                    outputSchema: outputSchema ?? undefined,
                  });
                }
          }
        />
      </ResizablePanel>
      <ResizableHandle />
      {result && (
        <ResizablePanel order={2} className="flex-1">
          <ExecutionResult
            executionResult={result as Record<string, unknown> | null}
          />
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}

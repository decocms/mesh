import { useWorkflowActions } from "../../stores/workflow";
import { MonacoCodeEditor } from "../monaco-editor";
import type { CodeStep } from "../types";

export function CodeActionTab({ step }: { step: CodeStep }) {
  const { updateStep } = useWorkflowActions();

  return (
    <div className="h-[calc(100%-60px)] bg-background">
      <MonacoCodeEditor
        key={`code-${step.name}`}
        height="100%"
        code={step.action.code}
        language="typescript"
        onSave={(code, outputSchema) => {
          updateStep(step.name, {
            action: { ...step.action, code },
            outputSchema: outputSchema as Record<string, unknown> | null,
          });
        }}
      />
    </div>
  );
}

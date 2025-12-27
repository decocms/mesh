import type { StepWithAction, CodeStep } from "../types";
import { ToolActionTab } from "./tool-action-tab";
import { CodeActionTab } from "./code-action-tab";

export function StepActionTab({ step }: { step: StepWithAction }) {
  if ("toolName" in step.action) {
    return (
      <div className="h-full bg-background">
        <ToolActionTab />
      </div>
    );
  } else if ("code" in step.action) {
    return <CodeActionTab step={step as CodeStep} />;
  }
  return null;
}

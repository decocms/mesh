import type { CodeStep } from "../types";
import { ToolActionTab } from "./tool-action-tab";
import { CodeActionTab } from "./code-action-tab";
import { useCurrentStep } from "../../stores/workflow";

export function StepActionTab() {
  const currentStep = useCurrentStep();
  if (
    currentStep &&
    ("toolName" in currentStep.action || "connectionId" in currentStep.action)
  ) {
    return <ToolActionTab />;
  } else if (currentStep && "code" in currentStep.action) {
    return <CodeActionTab step={currentStep as CodeStep} />;
  }
  return null;
}

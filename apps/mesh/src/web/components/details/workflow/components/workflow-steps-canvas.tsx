import { Button } from "@deco/ui/components/button.tsx";
import { Plus } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  useCurrentStepName,
  useWorkflowActions,
  useWorkflowSteps,
} from "../stores/workflow";
import { WorkflowStepCard } from "./workflow-step-card";

interface WorkflowStepsCanvasProps {
  className?: string;
}

export function WorkflowStepsCanvas({ className }: WorkflowStepsCanvasProps) {
  const steps = useWorkflowSteps();
  const currentStepName = useCurrentStepName();
  const { setCurrentStepName, deleteStep, addToolStep } = useWorkflowActions();

  return (
    <div className={cn("flex-1 flex flex-col p-8 overflow-auto", className)}>
      {/* Steps Container */}
      <div className="bg-muted/30 rounded-lg w-full">
        {/* Steps List */}
        <div className="pt-3">
          {steps.map((step, index) => (
            <WorkflowStepCard
              key={step.name}
              step={step}
              index={index}
              isSelected={step.name === currentStepName}
              isLast={index === steps.length - 1}
              onSelect={() => setCurrentStepName(step.name)}
              onDelete={() => deleteStep(step.name)}
            />
          ))}
        </div>

        {/* Add Step Button */}
        <div className="flex gap-2 items-start px-4 pb-3">
          {/* Empty space for line number alignment */}
          <div className="w-5 shrink-0" />

          {/* Connector and Add Button */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-px h-3 bg-border" />
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg"
              onClick={addToolStep}
            >
              <Plus size={14} />
            </Button>
            <div className="w-px h-8 bg-border" />
          </div>
        </div>
      </div>
    </div>
  );
}


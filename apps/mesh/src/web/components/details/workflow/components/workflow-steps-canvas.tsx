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
      <div className="w-full -space-y-1">
        {/* Steps List */}
        <div className="pt-3 -space-y-1">
          {steps.map((step, index) => (
            <WorkflowStepCard
              key={step.name}
              step={step}
              index={index}
              isSelected={step.name === currentStepName}
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
          <div className="flex flex-col border-1 border-transparent items-center shrink-0">
            <div className="w-px h-3 bg-border" />
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg"
              onClick={addToolStep}
            >
              <Plus size={14} />
            </Button>
            <div
              className="w-px h-8"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, var(--border), var(--border) 4px, transparent 4px, transparent 8px)",
                backgroundPosition: "left top",
                backgroundRepeat: "repeat-y",
                backgroundSize: "2px 100%",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

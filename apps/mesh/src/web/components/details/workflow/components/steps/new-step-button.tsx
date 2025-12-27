import { useState } from "react";
import { Plus, CodeXml, Wrench, X } from "lucide-react";
import { cn } from "@deco/ui/lib/utils.js";
import type { StepType } from "@/web/components/details/workflow/stores/workflow";

// ============================================
// Add First Step Button (for empty state)
// ============================================

interface AddFirstStepButtonProps {
  onAdd: (type: StepType) => void;
}

export function AddFirstStepButton({ onAdd }: AddFirstStepButtonProps) {
  const [isCreatingStep, setIsCreatingStep] = useState(false);

  const handleAdd = (type: StepType) => {
    onAdd(type);
    setIsCreatingStep(false);
  };

  return (
    <div
      className={cn(
        "w-6 h-6 rounded-lg border-2 border-dashed border-muted-foreground/30 transition-all ease-in-out cursor-pointer",
        "hover:border-primary hover:bg-primary/10",
        isCreatingStep && "bg-primary/10 border-primary border-solid",
      )}
    >
      <div className="w-full h-full flex items-center justify-center">
        <div className="transition-all duration-200 ease-in-out flex items-center justify-center w-full h-full">
          {/* Plus button (collapsed state) */}
          <div
            className={cn(
              "absolute transition-all duration-200 ease-in-out flex items-center justify-center w-full h-full",
              isCreatingStep && "scale-0 opacity-0 pointer-events-none",
            )}
          >
            <button
              type="button"
              onClick={() => setIsCreatingStep(true)}
              className="bg-transparent rounded-lg flex items-center justify-center cursor-pointer transition-all ease-in-out"
            >
              <Plus className="w-3 h-3 text-muted-foreground transition-all ease-in-out" />
            </button>
          </div>

          {/* Menu (expanded state) - floating overlay */}
          <div
            className={cn(
              "absolute transition-all duration-200 ease-in-out",
              !isCreatingStep && "scale-0 opacity-0 pointer-events-none",
            )}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAdd("code")}
                className="w-5 h-5 p-0.5 bg-background rounded-lg flex items-center justify-center hover:bg-primary/40 transition-all ease-in-out cursor-pointer"
              >
                <CodeXml className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleAdd("tool")}
                className="w-5 h-5 p-0.5 bg-background rounded-lg flex items-center justify-center hover:bg-primary/40 transition-all ease-in-out cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingStep(false)}
                className="w-5 h-5 p-px rounded-full bg-transparent transition-all ease-in-out cursor-pointer flex items-center justify-center"
              >
                <X className="w-4 h-4 text-primary-foreground transition-all ease-in-out" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { CodeXml, Plus, Wrench, X } from "lucide-react";
import { useState } from "react";
import type { StepType } from "../../stores/workflow";

interface AddStepButtonProps {
  onAdd: (type: StepType, afterStepName?: string) => void;
  afterStepName?: string;
  isLast?: boolean;
  visible?: boolean;
}

export function AddStepButton({
  onAdd,
  afterStepName,
  isLast = false,
  visible = true,
}: AddStepButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSelectType = (type: StepType) => {
    onAdd(type, afterStepName);
    setIsExpanded(false);
  };

  const handleClose = () => {
    setIsExpanded(false);
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center transition-all duration-150",
        isLast ? "h-10" : "h-0",
        visible || isExpanded ? "opacity-100" : "opacity-0",
      )}
    >
      <div className={cn("absolute z-10", isLast ? "top-1" : "-top-3")}>
        {!isExpanded ? (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className={cn(
              "h-6 w-6 rounded-full border border-border bg-background",
              "flex items-center justify-center cursor-pointer",
              "hover:border-accent hover:bg-accent/50 transition-all",
              "shadow-sm",
            )}
          >
            <Plus className="h-3 w-3 text-muted-foreground" />
          </button>
        ) : (
          <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1 shadow-lg">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleSelectType("tool")}
                  className="p-1.5 rounded hover:bg-accent/50 transition-colors"
                >
                  <Wrench className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Tool step</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleSelectType("code")}
                  className="p-1.5 rounded hover:bg-accent/50 transition-colors"
                >
                  <CodeXml className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Code step</TooltipContent>
            </Tooltip>
            <div className="w-px h-4 bg-border mx-0.5" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded hover:bg-accent/50 transition-colors text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

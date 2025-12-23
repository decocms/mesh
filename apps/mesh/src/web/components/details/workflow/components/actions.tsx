import {
  useCurrentTab,
  useIsDirty,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
} from "@/web/components/details/workflow/stores/workflow";
import { Icon } from "@deco/ui/components/icon.js";
import { Button } from "@deco/ui/components/button.js";
import { cn } from "@deco/ui/lib/utils.js";
import { History, StepForward } from "lucide-react";

export function WorkflowActions({
  onUpdate,
}: {
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const {
    resetToOriginalWorkflow,
    setTrackingExecutionId,
    setOriginalWorkflow,
  } = useWorkflowActions();
  const workflow = useWorkflow();
  const trackingExecutionId = useTrackingExecutionId();
  const isDirty = useIsDirty();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-muted-foreground font-normal"
        onClick={() => resetToOriginalWorkflow()}
        disabled={!isDirty}
      >
        <Icon name="refresh" className="w-4 h-4" />
        Reset
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-muted-foreground font-normal"
        onClick={() => {
          setTrackingExecutionId(undefined);
        }}
        disabled={!trackingExecutionId}
      >
        <Icon name="clear" className="w-4 h-4" />
        Clear
      </Button>
      <WorkflowTabs />
      <Button
        className="bg-[#d0ec1a] text-[#07401a] hover:bg-[#d0ec1a]/90 h-7 text-xs font-medium"
        onClick={() => {
          onUpdate(workflow).then(() => {
            setOriginalWorkflow(workflow);
          });
        }}
        disabled={!isDirty}
      >
        Save changes
      </Button>
    </>
  );
}

function WorkflowTabs() {
  const currentTab = useCurrentTab();
  const { setCurrentTab } = useWorkflowActions();
  return (
    <div className="bg-muted border border-border rounded-lg flex">
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          currentTab !== "steps" && "bg-transparent text-muted-foreground",
        )}
        onClick={() => setCurrentTab("steps")}
      >
        <StepForward className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          currentTab !== "executions" && "bg-transparent text-muted-foreground",
        )}
        onClick={() => setCurrentTab("executions")}
      >
        <History className="w-4 h-4" />
      </Button>
    </div>
  );
}

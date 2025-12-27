import {
  useWorkflow,
  useTrackingExecutionId,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowExecutionCollectionList } from "../../hooks/use-workflow-collection-item";
import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { ExecutionBar } from "./execution-bar";
import { useExecutionNavigation } from "./hooks/use-execution-navigation";

export function ExecutionsTab() {
  const workflow = useWorkflow();
  const trackingExecutionId = useTrackingExecutionId();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });
  const { containerRef, handleKeyDown, handleItemClick, setItemRef } =
    useExecutionNavigation(executions);

  return (
    <ScrollArea className="h-full">
      <div
        ref={containerRef}
        className="flex flex-col outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {executions.length === 0 && (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            No executions yet
          </div>
        )}
        {executions.map((execution: { id: string }) => (
          <ExecutionBar
            key={execution.id}
            ref={(el) => setItemRef(execution.id, el)}
            executionId={execution.id}
            isSelected={execution.id === trackingExecutionId}
            onClick={() => handleItemClick(execution.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

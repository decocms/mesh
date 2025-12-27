import { useRef } from "react";
import type React from "react";
import {
  useWorkflowActions,
  useTrackingExecutionId,
} from "@/web/components/details/workflow/stores/workflow";
import type { WorkflowExecution } from "@decocms/bindings/workflow";

export function useExecutionNavigation(executions: WorkflowExecution[]) {
  const { setTrackingExecutionId } = useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const currentIndex = executions.findIndex(
    (e) => e.id === trackingExecutionId,
  );

  const scrollToExecution = (executionId: string) => {
    const element = itemRefs.current.get(executionId);
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (executions.length === 0) return;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const nextIndex =
          currentIndex === -1
            ? 0
            : Math.min(currentIndex + 1, executions.length - 1);
        const nextExecution = executions[nextIndex];
        if (nextExecution) {
          setTrackingExecutionId(nextExecution.id);
          scrollToExecution(nextExecution.id);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prevIndex =
          currentIndex === -1
            ? executions.length - 1
            : Math.max(currentIndex - 1, 0);
        const prevExecution = executions[prevIndex];
        if (prevExecution) {
          setTrackingExecutionId(prevExecution.id);
          scrollToExecution(prevExecution.id);
        }
        break;
      }
      case "Escape": {
        event.preventDefault();
        containerRef.current?.blur();
        break;
      }
    }
  };

  const handleItemClick = (executionId: string) => {
    setTrackingExecutionId(executionId);
    containerRef.current?.focus();
  };

  const setItemRef = (executionId: string, element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(executionId, element);
    } else {
      itemRefs.current.delete(executionId);
    }
  };

  return {
    containerRef,
    handleKeyDown,
    handleItemClick,
    setItemRef,
  };
}

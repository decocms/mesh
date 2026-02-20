/**
 * Threads View Component
 *
 * Task-aware thread view for the side-panel chat overlay.
 * Uses the shared TaskListContent for a unified tasks UI.
 */

import { Loading01 } from "@untitledui/icons";
import { Suspense } from "react";
import { ErrorBoundary } from "../error-boundary";
import { useChat } from "./index";
import { TaskListContent } from "./tasks-panel";

/**
 * ThreadsView Component
 *
 * A full-view of tasks for the lateral chat panel.
 * Replaces the old flat thread list with the task-aware grouped UI.
 */
interface ThreadsViewProps {
  onClose: () => void;
}

export function ThreadsView({ onClose }: ThreadsViewProps) {
  const { switchToThread } = useChat();

  const handleTaskSelect = async (taskId: string) => {
    await switchToThread(taskId);
    onClose();
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b shrink-0">
        <span className="text-sm font-medium">Tasks</span>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to chat
        </button>
      </div>

      <ErrorBoundary
        fallback={() => (
          <div className="flex-1 flex items-center justify-center px-4 text-center">
            <p className="text-xs text-muted-foreground">
              Unable to load tasks
            </p>
          </div>
        )}
      >
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loading01
                size={20}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <TaskListContent onTaskSelect={handleTaskSelect} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

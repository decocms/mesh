/**
 * TasksPanelColumn — fixed-width left column hosting the org-wide TasksPanel.
 *
 * Lives outside the agent-scoped Suspense so it stays mounted across
 * virtualMcpId switches. Default open state follows the count of tasks +
 * automations; user-driven `?tasks=0|1` overrides the default.
 */

import { Suspense } from "react";
import { useTasksPanelState } from "@/web/hooks/use-tasks-panel-state";
import { TasksPanel } from "@/web/layouts/tasks-panel";

const TASKS_COLUMN_WIDTH_PX = 280;

function TasksPanelColumnInner() {
  const { tasksOpen } = useTasksPanelState();

  if (!tasksOpen) return null;

  return (
    <aside
      className="shrink-0 h-full bg-sidebar pb-1"
      style={{ width: `${TASKS_COLUMN_WIDTH_PX}px` }}
    >
      <div className="h-full p-0.5 pt-0.25">
        <div className="h-full bg-background rounded-[0.75rem] overflow-hidden card-shadow">
          <TasksPanel />
        </div>
      </div>
    </aside>
  );
}

export function TasksPanelColumn() {
  return (
    <Suspense fallback={null}>
      <TasksPanelColumnInner />
    </Suspense>
  );
}

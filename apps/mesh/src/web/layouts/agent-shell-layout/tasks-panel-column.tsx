/**
 * TasksPanelColumn — fixed-width left column hosting the org-wide TasksPanel.
 *
 * Lives outside the agent-scoped Suspense so it stays mounted across
 * virtualMcpId switches. Default open state follows the count of tasks +
 * automations; user-driven `?tasks=0|1` overrides the default.
 */

import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { useTasks } from "@/web/components/chat/task/use-task-manager";
import { useAutomationsList } from "@/web/hooks/use-automations";
import { resolveTasksOpen } from "@/web/hooks/use-layout-state";
import { TasksPanel } from "@/web/layouts/tasks-panel";

const TASKS_COLUMN_WIDTH_PX = 280;

function TasksPanelColumnInner() {
  const search = useSearch({ strict: false }) as { tasks?: number };
  const { tasks } = useTasks({ owner: "all", status: "open" });
  const { data: automations = [] } = useAutomationsList(undefined);

  const hasItems = tasks.length > 0 || automations.length > 0;
  const open = resolveTasksOpen(search.tasks, hasItems);

  if (!open) return null;

  return (
    <aside
      className="shrink-0 h-full bg-sidebar pb-1"
      style={{ width: `${TASKS_COLUMN_WIDTH_PX}px` }}
    >
      <div className="h-full p-0.5">
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

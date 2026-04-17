/**
 * TasksPanelColumn — fixed-width left column hosting the org-wide TasksPanel.
 *
 * Lives outside the agent-scoped Suspense so it stays mounted across
 * virtualMcpId switches. Visibility driven by ?tasks (default: open).
 */

import { useSearch } from "@tanstack/react-router";
import { TasksPanel } from "@/web/layouts/tasks-panel";

const TASKS_COLUMN_WIDTH_PX = 280;

export function TasksPanelColumn() {
  const search = useSearch({ strict: false }) as { tasks?: number };
  const open = search.tasks !== 0;
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

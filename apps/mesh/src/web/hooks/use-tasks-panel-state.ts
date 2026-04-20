import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTasks } from "@/web/components/chat/task/use-task-manager";
import { resolveTasksOpen } from "@/web/hooks/use-layout-state";

/**
 * Standalone hook for tasks-panel state.
 *
 * URL model: ?tasks=0|1 (absent → defaults to "open iff tasks exist").
 * Once the user toggles, the ?tasks param pins their choice regardless of
 * later task-count changes.
 *
 * Consumed by both TasksPanelColumn (outside the agent Suspense) and
 * ToggleButtons (inside the agent Suspense). React Query dedupes the
 * underlying fetches across consumers.
 */
export function useTasksPanelState() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tasks?: number };
  const { tasks } = useTasks({ owner: "all", status: "open" });

  const tasksOpen = resolveTasksOpen(search.tasks, tasks.length > 0);

  const toggleTasks = () => {
    navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        tasks: tasksOpen ? 0 : 1,
      })) as any,
      replace: true,
    });
  };

  return { tasksOpen, toggleTasks };
}

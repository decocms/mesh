import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTasks } from "@/web/components/chat/task/use-task-manager";
import { useAutomationsList } from "@/web/hooks/use-automations";
import { resolveTasksOpen } from "@/web/hooks/use-layout-state";

/**
 * Standalone hook for tasks-panel state.
 *
 * URL model: ?tasks=0|1 (absent → defaults to "open iff tasks/automations exist").
 *
 * Consumed by both TasksPanelColumn (outside the agent Suspense) and
 * ToggleButtons (inside the agent Suspense). React Query dedupes the
 * underlying fetches across consumers.
 */
export function useTasksPanelState() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tasks?: number };
  const { tasks } = useTasks({ owner: "all", status: "open" });
  const { data: automations = [] } = useAutomationsList(undefined);

  const hasItems = tasks.length > 0 || automations.length > 0;
  const tasksOpen = resolveTasksOpen(search.tasks, hasItems);

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

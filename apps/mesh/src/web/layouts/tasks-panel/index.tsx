/**
 * TasksPanel — left-panel entry point. Org-wide (not scoped to a virtualMCP).
 * Renders two sections of tasks:
 *   - "Tasks": tasks I created that do not run an automation.
 *   - "Automations": tasks that run an automation (regardless of author).
 */

import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import {
  useMCPClient,
  useProjectContext,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "@untitledui/icons";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Chat } from "@/web/components/chat";
import { EmptyState } from "@/web/components/empty-state";
import { useTasks } from "@/web/components/chat/task/use-task-manager";
import { callUpdateTaskTool } from "@/web/components/chat/task/helpers";
import type { Task } from "@/web/components/chat/task/types";
import { useTasksAutoRefresh } from "@/web/hooks/use-tasks-auto-refresh";
import { usePanelActions } from "@/web/layouts/shell-layout";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { TasksSection } from "./tasks-section";

function TasksPanelContent() {
  useTasksAutoRefresh();
  const { tasks: myTasks } = useTasks({
    owner: "me",
    status: "open",
    hasTrigger: false,
  });
  const { tasks: automationTasks } = useTasks({
    owner: "all",
    status: "open",
    hasTrigger: true,
  });
  const { setTaskId, createNewTask } = usePanelActions();
  const params = useParams({ strict: false }) as { taskId?: string };
  const { locator, org } = useProjectContext();
  const queryClient = useQueryClient();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const activeTaskId = params.taskId ?? null;

  const sortedMyTasks = [...myTasks].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );
  const sortedAutomationTasks = [...automationTasks].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );

  const handleArchive = async (task: Task) => {
    try {
      await callUpdateTaskTool(client, task.id, { hidden: true });
      queryClient.invalidateQueries({
        queryKey: KEYS.tasksPrefix(locator),
      });
    } catch (error) {
      const err = error as Error;
      toast.error(`Failed to archive task: ${err.message}`);
    }
  };

  if (myTasks.length === 0 && automationTasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          image={<ClipboardCheck size={48} className="text-muted-foreground" />}
          title="No tasks yet"
          description="Start a conversation to create your first task."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-2 gap-3">
      <TasksSection
        title="Tasks"
        tasks={sortedMyTasks}
        activeTaskId={activeTaskId}
        onSelect={(t) => setTaskId(t.id, t.virtual_mcp_id)}
        onArchive={handleArchive}
        onNew={createNewTask}
        showNewButton
      />
      <TasksSection
        title="Automations"
        tasks={sortedAutomationTasks}
        activeTaskId={activeTaskId}
        onSelect={(t) => setTaskId(t.id, t.virtual_mcp_id)}
        onArchive={handleArchive}
        showAutomationBadge
        emptyLabel="No automation runs yet"
      />
    </div>
  );
}

function TasksPanelSkeleton() {
  return (
    <div className="flex flex-col h-full p-2 gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted/60 animate-pulse" />
      ))}
    </div>
  );
}

export function TasksPanel() {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense fallback={<TasksPanelSkeleton />}>
        <TasksPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

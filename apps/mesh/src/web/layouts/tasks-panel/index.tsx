/**
 * TasksPanel — left-panel entry point. Org-wide (not scoped to a virtualMCP).
 * Lists all org tasks and automations with their originating MCP avatar.
 */

import { Suspense } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
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
import { useAutomationsList } from "@/web/hooks/use-automations";
import { usePanelActions } from "@/web/layouts/shell-layout";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { TasksSection } from "./tasks-section";
import { AutomationsSection } from "./automations-section";

export { statusVerb } from "./status-verb";

function TasksPanelContent() {
  const { tasks } = useTasks({ owner: "all", status: "open" });
  const { data: automations = [] } = useAutomationsList(undefined);
  const { setTaskId, openTab } = usePanelActions();
  const search = useSearch({ strict: false }) as { main?: string };
  const params = useParams({ strict: false }) as { taskId?: string };
  const { locator, org } = useProjectContext();
  const queryClient = useQueryClient();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const activeTaskId = params.taskId ?? null;
  const activeAutomationId = search.main?.startsWith("automation:")
    ? search.main.slice("automation:".length)
    : null;

  const sortedTasks = [...tasks].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );
  const sortedAutomations = [...automations].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
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

  if (tasks.length === 0 && automations.length === 0) {
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
      <AutomationsSection
        automations={sortedAutomations}
        activeAutomationId={activeAutomationId}
        onSelect={(a) => openTab("automation:" + a.id)}
        onNew={() => openTab("automation:new")}
      />
      <TasksSection
        tasks={sortedTasks}
        activeTaskId={activeTaskId}
        onSelect={(t) => setTaskId(t.id, t.virtual_mcp_id)}
        onArchive={handleArchive}
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

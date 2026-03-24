/**
 * Global Tasks Side Panel
 *
 * Mirrors the ChatPanel pattern — lives in the shell layout,
 * visible on every page. Selecting a task switches the chat
 * conversation and opens the chat panel.
 */

import { Page } from "@/web/components/page";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useDecoTasksOpen } from "@/web/hooks/use-deco-tasks-open";
import { Loading01, Plus, Settings01, X } from "@untitledui/icons";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";
import { Suspense, useTransition } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";
import { OwnerFilter, TaskListContent } from "./tasks-panel";

function TasksPanelContent() {
  const [, setTasksOpen] = useDecoTasksOpen();
  const [, setChatOpen] = useDecoChatOpen();
  const { createTask, switchToTask } = useChat();
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const [isPending, startTransition] = useTransition();

  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId",
    shouldThrow: false,
  });
  const projectsMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId",
    shouldThrow: false,
  });
  const virtualMcpId =
    (spacesMatch ?? projectsMatch)?.params.virtualMcpId ?? null;

  const handleNewTask = () => {
    startTransition(() => {
      createTask();
    });
  };

  return (
    <div className="flex flex-col h-full">
      <Page.Header className="flex-none" hideSidebarTrigger>
        <Page.Header.Left className="gap-2">
          <span className="text-sm font-medium text-foreground">Tasks</span>
        </Page.Header.Left>
        <Page.Header.Right className="gap-1">
          <OwnerFilter />
          {virtualMcpId && (
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/$org/spaces/$virtualMcpId/settings",
                  params: {
                    org: org.slug,
                    virtualMcpId,
                  },
                })
              }}
              className="flex size-10 md:size-6 items-center justify-center rounded-full p-1 outline-none focus-visible:ring-0 hover:bg-transparent group cursor-pointer"
              title="Space settings"
            >
              <Settings01
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          )}
          <button
            type="button"
            onClick={handleNewTask}
            disabled={isPending}
            className="flex size-10 md:size-6 items-center justify-center rounded-full p-1 outline-none focus-visible:ring-0 hover:bg-transparent group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="New task"
          >
            <Plus
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </button>
          <button
            type="button"
            onClick={() => setTasksOpen(false)}
            className="flex size-10 md:size-6 items-center justify-center rounded-full p-1 outline-none focus-visible:ring-0 hover:bg-transparent transition-colors group cursor-pointer"
            title="Close tasks"
          >
            <X
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </button>
        </Page.Header.Right>
      </Page.Header>

      <TaskListContent
        virtualMcpId={virtualMcpId}
        onTaskSelect={(taskId) => {
          switchToTask(taskId);
          // Open chat panel so user sees the conversation
          setChatOpen(true);
        }}
      />
    </div>
  );
}

export function TasksSidePanel() {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={16}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <TasksPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

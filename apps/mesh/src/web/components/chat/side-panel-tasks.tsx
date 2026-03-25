/**
 * Global Tasks Side Panel
 *
 * Mirrors the ChatPanel pattern — lives in the shell layout,
 * visible on every page. Selecting a task switches the chat
 * conversation and opens the chat panel.
 */

import { Page } from "@/web/components/page";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { Loading01, MessageTextCircle02, Plus } from "@untitledui/icons";
import { useMatch } from "@tanstack/react-router";
import { useVirtualMCP } from "@decocms/mesh-sdk";
import { Suspense, useTransition } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";
import { OwnerFilter, TaskListContent } from "./tasks-panel";

function TasksPanelContent() {
  const [isChatOpen, setChatOpen] = useDecoChatOpen();
  const { createTask, switchToTask } = useChat();
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

  const virtualMcp = useVirtualMCP(virtualMcpId);

  const handleNewTask = () => {
    startTransition(() => {
      createTask();
    });
  };

  return (
    <div className="flex flex-col h-full">
      <Page.Header className="flex-none" hideSidebarTrigger>
        <Page.Header.Left className="gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {virtualMcp?.title ?? "Tasks"}
          </span>
        </Page.Header.Left>
        <Page.Header.Right className="gap-1">
          <OwnerFilter />
          <button
            type="button"
            onClick={() => setChatOpen((prev) => !prev)}
            className={`flex size-10 md:size-6 items-center justify-center rounded-full p-1 outline-none focus-visible:ring-0 hover:bg-transparent group cursor-pointer ${isChatOpen ? "bg-accent" : ""}`}
            title="Toggle chat"
          >
            <MessageTextCircle02
              size={16}
              className={`transition-colors ${isChatOpen ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}
            />
          </button>
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

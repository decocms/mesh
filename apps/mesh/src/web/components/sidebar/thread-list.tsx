/**
 * Thread List Component for Sidebar
 *
 * Displays active chat threads in the sidebar with status indicators.
 */

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@deco/ui/components/sidebar.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { MessageChatSquare } from "@untitledui/icons";
import { useEffect, useState } from "react";
import { useChatPool, type ThreadStatus } from "../chat/chat-pool";
import { useChat } from "../chat/context";
import type { Thread } from "../chat/types";

interface ThreadListItemProps {
  thread: Thread;
  isActive: boolean;
  status: ThreadStatus;
  onClick: () => void;
}

function ThreadListItem({
  thread,
  isActive,
  status,
  onClick,
}: ThreadListItemProps) {
  // Auto-fade completed status back to idle after 3 seconds
  const [displayStatus, setDisplayStatus] = useState(status);

  // eslint-disable-next-line ban-use-effect/ban-use-effect -- UI behavior: timer needed for status fade animation
  useEffect(() => {
    setDisplayStatus(status);

    if (status === "completed") {
      const timer = setTimeout(() => {
        setDisplayStatus("idle");
      }, 3000);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [status]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onClick}
        isActive={isActive}
        className="group/thread-item cursor-pointer"
        tooltip={thread.title || "New chat"}
      >
        {/* Status dot indicator */}
        <span
          className={cn(
            "size-2 rounded-full shrink-0 transition-colors",
            displayStatus === "streaming" &&
              "bg-blue-500 animate-pulse ring-2 ring-blue-500/30",
            displayStatus === "completed" &&
              "bg-green-500 ring-2 ring-green-500/30",
            displayStatus === "error" && "bg-red-500 ring-2 ring-red-500/30",
            displayStatus === "idle" && "bg-muted-foreground/30",
          )}
        />
        <span className="truncate text-sm">{thread.title || "New chat"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function ThreadList() {
  const { threads, activeThreadId, setActiveThreadId } = useChat();
  const pool = useChatPool();

  // Only show threads that are either active or in the pool
  const activeThreadIds = pool.getActiveThreadIds();
  const visibleThreads = threads.filter(
    (thread) =>
      thread.id === activeThreadId || activeThreadIds.includes(thread.id),
  );

  if (visibleThreads.length === 0) {
    return null;
  }

  return (
    <>
      {/* Divider */}
      <div className="mx-3 my-2 border-t border-sidebar-border" />

      {/* Active Chats Header */}
      <div className="px-3 py-1">
        <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
          Active Chats
        </span>
      </div>

      <SidebarMenu className="gap-0.5">
        {visibleThreads.map((thread) => {
          const statusInfo = pool.getThreadStatus(thread.id);
          return (
            <ThreadListItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              status={statusInfo.status}
              onClick={() => setActiveThreadId(thread.id)}
            />
          );
        })}
      </SidebarMenu>

      {visibleThreads.length > 0 && (
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageChatSquare size={12} />
            <span>
              {visibleThreads.length} active{" "}
              {visibleThreads.length === 1 ? "chat" : "chats"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

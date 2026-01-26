/**
 * Threads Sidebar Component
 *
 * A right-side sliding panel that displays chat thread history.
 */

import { Input } from "@deco/ui/components/input.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@deco/ui/components/sheet.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { MessageChatSquare, SearchMd } from "@untitledui/icons";
import { useState } from "react";
import type { Thread } from "./types.ts";

/**
 * ThreadsViewContent Component
 *
 * Core content component for displaying threads (header, search, list).
 * Does not include any wrapper - meant to be used within different containers.
 */
interface ThreadsViewContentProps {
  threads: Thread[];
  activeThreadId: string;
  onThreadSelect: (threadId: string) => void;
  onClose?: () => void;
  showHeader?: boolean;
  showBackButton?: boolean;
}

export function ThreadsViewContent({
  threads,
  activeThreadId,
  onThreadSelect,
  onClose,
  showHeader = true,
  showBackButton = false,
}: ThreadsViewContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredThreads = !searchQuery.trim()
    ? threads
    : threads.filter((thread) =>
        (thread.title || "New chat")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      );

  const handleThreadSelect = (threadId: string) => {
    onThreadSelect(threadId);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Header */}
      {showHeader && (
        <div className="h-12 px-4 flex items-center justify-between border-b shrink-0">
          <span className="text-sm font-medium">Chat History</span>
          {showBackButton && (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to chat
            </button>
          )}
        </div>
      )}

      <div className={cn("px-3 py-3 border-b", "shrink-0")}>
        <div className="relative">
          <SearchMd
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Threads list */}
      <div className="flex-1 overflow-y-auto">
        {filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
            <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center">
              <MessageChatSquare size={24} className="text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {searchQuery ? "No results found" : "No conversations yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "Start a new chat to see your history here"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col py-2">
            {filteredThreads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleThreadSelect(thread.id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                    isActive && "bg-accent/50",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm truncate",
                        isActive
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {thread.title || "New chat"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(thread.updatedAt).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

interface ThreadsSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threads: Thread[];
  activeThreadId: string;
  onThreadSelect: (threadId: string) => void;
}

export function ThreadsSidebar({
  open,
  onOpenChange,
  threads,
  activeThreadId,
  onThreadSelect,
}: ThreadsSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[320px] sm:w-[380px] p-0 flex flex-col"
      >
        <SheetHeader className="h-12 px-4 flex flex-row items-center justify-between border-b shrink-0">
          <SheetTitle className="text-sm font-medium">Chat History</SheetTitle>
        </SheetHeader>

        <ThreadsViewContent
          threads={threads}
          activeThreadId={activeThreadId}
          onThreadSelect={onThreadSelect}
          showHeader={false}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * ThreadsView Component
 *
 * A full-view of threads for the lateral chat panel.
 * Uses CSS visibility toggle instead of z-index overlay.
 */
interface ThreadsViewProps {
  threads: Thread[];
  activeThreadId: string;
  onThreadSelect: (threadId: string) => void;
  onClose: () => void;
}

export function ThreadsView({
  threads,
  activeThreadId,
  onThreadSelect,
  onClose,
}: ThreadsViewProps) {
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <ThreadsViewContent
        threads={threads}
        activeThreadId={activeThreadId}
        onThreadSelect={onThreadSelect}
        onClose={onClose}
        showBackButton
      />
    </div>
  );
}

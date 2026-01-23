import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  getWellKnownDecopilotAgent,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ChevronDown,
  ChevronRight,
  CpuChip02,
  MessageChatSquare,
  Trash01,
} from "@untitledui/icons";
import { Suspense, useState, useContext } from "react";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useNavigate } from "@tanstack/react-router";
import { useThreads } from "@/web/hooks/use-chat-store";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { ChatContext } from "./context";
import type { Thread } from "./types.ts";

/**
 * Individual chat thread item content (just the content, not the wrapper)
 */
function ChatThreadItem({ thread }: { thread: Thread }) {
  const { org } = useProjectContext();
  const virtualMcps = useVirtualMCPs();

  // Get agent icon - use thread's virtualMcpId or default to Decopilot
  const agent = thread.virtualMcpId
    ? virtualMcps.find((v) => v.id === thread.virtualMcpId)
    : null;
  const defaultAgent = getWellKnownDecopilotAgent(org.id);
  const displayAgent = agent ?? defaultAgent;

  return (
    <>
      <IntegrationIcon
        icon={displayAgent.icon}
        name={displayAgent.title}
        size="xs"
        fallbackIcon={<CpuChip02 size={12} />}
        className="rounded-md shrink-0 aspect-square"
      />
      <span className="text-sm truncate flex-1 min-w-0 text-left">
        {thread.title || "New chat"}
      </span>
    </>
  );
}

/**
 * Sidebar chats section content
 * Replicates the logic from ThreadHistoryPopover but in sidebar format
 */
function SidebarChatsSectionContent() {
  const { org, locator } = useProjectContext();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";
  
  // Try to get threads from Chat context first (like ThreadHistoryPopover does)
  const chatContext = useContext(ChatContext);

  // Always call useThreads hook (React hooks rules)
  const threadsData = useThreads();
  const [storedActiveThreadId, setStoredActiveThreadId] =
    useLocalStorage<string>(
      LOCALSTORAGE_KEYS.assistantChatActiveThread(locator) + ":state",
      "",
    );

  // If Chat context is available, use it (same as ThreadHistoryPopover)
  // Otherwise, fall back to useThreads hook and localStorage
  // Prefer threads from database (threadsData) over context, as context may be stale
  const threads =
    threadsData.threads.length > 0
      ? threadsData.threads
      : (chatContext?.threads ?? []);
  const activeThreadId = chatContext?.activeThreadId ?? storedActiveThreadId;
  const setActiveThreadId =
    chatContext?.setActiveThreadId ??
    ((id: string) => {
      setStoredActiveThreadId(id);
      navigate({ to: "/$org", params: { org: org.id } });
    });
  const hideThread = chatContext?.hideThread;

  const handleThreadClick = (threadId: string) => {
    setActiveThreadId(threadId);

    // Navigate to home if not already there
    const currentPath = window.location.pathname;
    const orgPath = `/${org.id}`;
    if (currentPath !== orgPath && currentPath !== `${orgPath}/`) {
      navigate({ to: "/$org", params: { org: org.id } });
    }
  };

  const handleHideThread = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (hideThread) {
      hideThread(threadId);
    }
  };

  // Always show the section, even when empty (as requested)
  return (
    <>
      <SidebarSeparator className="my-2 -ml-1" />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
              tooltip="All chats"
            >
              <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
                <MessageChatSquare />
              </span>
              {!isCollapsed && (
                <>
                  <span className="truncate">All chats</span>
                  {isOpen ? (
                    <ChevronDown size={12} className="ml-auto shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="ml-auto shrink-0" />
                  )}
                </>
              )}
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent>
          {threads.length === 0 ? (
            <SidebarMenuItem>
              <div className="px-4 py-2 text-xs text-muted-foreground">
                No chats yet
              </div>
            </SidebarMenuItem>
          ) : (
            threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <SidebarMenuItem key={thread.id}>
                  <div className="group relative w-full">
                    <SidebarMenuButton
                      className={cn(
                        "w-full cursor-pointer text-foreground/90 hover:text-foreground pr-8",
                        isActive && "bg-accent/50",
                      )}
                      onClick={() => handleThreadClick(thread.id)}
                      tooltip={thread.title || "New chat"}
                    >
                      <ChatThreadItem thread={thread} />
                    </SidebarMenuButton>
                    {hideThread && (
                      <button
                        type="button"
                        onClick={(e) => handleHideThread(thread.id, e)}
                        className="opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-destructive/10 rounded transition-opacity z-10"
                        title="Remove chat"
                      >
                        <Trash01
                          size={14}
                          className="text-muted-foreground hover:text-destructive"
                        />
                      </button>
                    )}
                  </div>
                </SidebarMenuItem>
              );
            })
          )}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

/**
 * Skeleton for loading chat threads
 */
function SidebarChatsSectionSkeleton() {
  return (
    <>
      <SidebarSeparator className="my-2 -ml-1" />
      <SidebarMenuItem>
        <div className="px-2 py-0 text-xs font-medium h-6 text-muted-foreground flex items-center">
          <Skeleton className="h-3 w-20" />
        </div>
      </SidebarMenuItem>
      {Array.from({ length: 3 }).map((_, i) => (
        <SidebarMenuItem key={i}>
          <div className="flex items-center gap-2 px-4 py-2">
            <Skeleton className="size-4 rounded-md" />
            <Skeleton className="h-4 flex-1" />
          </div>
        </SidebarMenuItem>
      ))}
    </>
  );
}

/**
 * Empty state for sidebar chats section
 */
function SidebarChatsSectionEmpty() {
  const [isOpen, setIsOpen] = useState(true);
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === "collapsed";
  
  return (
    <>
      <SidebarSeparator className="my-2 -ml-1" />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className="group/nav-item cursor-pointer text-foreground/90 hover:text-foreground"
              tooltip="All chats"
            >
              <span className="text-muted-foreground group-hover/nav-item:text-foreground transition-colors [&>svg]:size-4">
                <MessageChatSquare />
              </span>
              {!isCollapsed && (
                <>
                  <span className="truncate">All chats</span>
                  {isOpen ? (
                    <ChevronDown size={12} className="ml-auto shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="ml-auto shrink-0" />
                  )}
                </>
              )}
            </SidebarMenuButton>
          </CollapsibleTrigger>
        </SidebarMenuItem>
        <CollapsibleContent>
          <SidebarMenuItem>
            <div className="px-4 py-2 text-xs text-muted-foreground">
              No chats yet
            </div>
          </SidebarMenuItem>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

/**
 * Sidebar chats section - displays all chat threads in a collapsible section
 * Always shows the section, even when empty or on error
 */
export function SidebarChatsSection() {
  return (
    <Suspense fallback={<SidebarChatsSectionSkeleton />}>
      <ErrorBoundary fallback={<SidebarChatsSectionEmpty />}>
        <SidebarChatsSectionContent />
      </ErrorBoundary>
    </Suspense>
  );
}

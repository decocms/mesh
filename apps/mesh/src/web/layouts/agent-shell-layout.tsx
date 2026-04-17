/**
 * Agent Shell Layout
 *
 * Provides sidebar chrome (StudioSidebar) and the agent inset provider
 * (virtualMCP resolution, Chat.Provider, 3-panel resizable layout).
 * This layout wraps all agent and org-home routes via a pathless id route.
 */

import { createContext, use, useEffect, useLayoutEffect, useRef } from "react";
import { Chat, useChatTask } from "@/web/components/chat/index";
import { useTasks } from "@/web/components/chat/task/use-task-manager";
import { ChatCenterPanel } from "@/web/layouts/chat-center-panel";
import { TasksPanel } from "@/web/layouts/tasks-panel";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { isMac, isModKey } from "@/web/lib/keyboard-shortcuts";
import { StudioSidebar, StudioSidebarMobile } from "@/web/components/sidebar";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type ImperativePanelGroupHandle,
} from "@/web/components/resizable";
import {
  SidebarInset,
  SidebarLayout,
  SidebarProvider,
  useSidebar,
} from "@deco/ui/components/sidebar.tsx";
import { Sheet, SheetContent, SheetTitle } from "@deco/ui/components/sheet.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import {
  AlertCircle,
  Browser,
  ChevronLeft,
  ChevronRight,
  LayoutLeft,
  Edit05,
  Loading01,
  Menu01,
  LayoutRight,
} from "@untitledui/icons";
import {
  getDecopilotId,
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { PropsWithChildren, Suspense, useTransition } from "react";
import { useStatusSounds } from "../hooks/use-status-sounds";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import {
  computeDefaultSizes,
  usePanelState,
} from "@/web/hooks/use-layout-state";
import { getActiveGithubRepo } from "@/web/lib/github-repo";
import { MainPanelWithTabs } from "@/web/layouts/main-panel-tabs";

import { GitHubIcon } from "@/web/components/icons/github-icon";

// ---------------------------------------------------------------------------
// Types & Context
// ---------------------------------------------------------------------------

export interface InsetContextValue {
  virtualMcpId: string;
  entity: VirtualMCPEntity | null;
}

const InsetContext = createContext<InsetContextValue | null>(null);

export function useInsetContext(): InsetContextValue | null {
  return use(InsetContext);
}

// ---------------------------------------------------------------------------
// Resizable panel wrappers
// ---------------------------------------------------------------------------

/**
 * This component persists the width of the chat panel across reloads.
 * Also, it's important to keep it like this to avoid unnecessary re-renders.
 */
function PersistentResizablePanel({
  children,
  defaultSize,
}: PropsWithChildren<{
  defaultSize: number;
}>) {
  const [_isPending, startTransition] = useTransition();
  const [, setChatPanelWidth] = useLocalStorage(
    LOCALSTORAGE_KEYS.decoChatPanelWidth(),
    25,
  );

  const handleResize = (size: number) =>
    startTransition(() => {
      if (size > 0) setChatPanelWidth(size);
    });

  return (
    <ResizablePanel
      defaultSize={defaultSize}
      minSize={20}
      collapsible={true}
      collapsedSize={0}
      className="min-w-0 overflow-hidden bg-sidebar"
      onResize={handleResize}
      order={2}
    >
      {children}
    </ResizablePanel>
  );
}

/**
 * Collapsible tasks sidebar panel. Fixed minimum width of 22% — not persisted.
 */
function TasksResizablePanel({
  children,
  defaultSize,
}: PropsWithChildren<{
  defaultSize: number;
}>) {
  return (
    <ResizablePanel
      defaultSize={defaultSize}
      minSize={22}
      collapsible={true}
      collapsedSize={0}
      className="min-w-0 overflow-hidden bg-sidebar"
      order={1}
    >
      {children}
    </ResizablePanel>
  );
}

// ---------------------------------------------------------------------------
// Agent inset sub-components
// ---------------------------------------------------------------------------

/**
 * Reads taskId from ChatTaskContext and wraps children in ActiveTaskProvider
 * inside a Suspense + ErrorBoundary boundary.
 */
function ActiveTaskBoundary({
  children,
  variant,
}: {
  children?: React.ReactNode;
  variant?: "home" | "default";
}) {
  const { taskId } = useChatTask();
  return (
    <ErrorBoundary
      fallback={
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Something went wrong loading the chat. Try refreshing.
        </div>
      }
    >
      <Suspense fallback={<Chat.Skeleton />}>
        <Chat.ActiveTaskProvider taskId={taskId}>
          {children ?? <ChatCenterPanel variant={variant} />}
        </Chat.ActiveTaskProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Bridges createNewTask to the toolbar ref so the ⇧⌘S shortcut can create tasks.
 */
function NewTaskBridge({
  onNewTaskRef,
  createNewTask,
}: {
  onNewTaskRef: React.MutableRefObject<(() => void) | null>;
  createNewTask: () => void;
}) {
  useLayoutEffect(() => {
    onNewTaskRef.current = createNewTask;
    return () => {
      onNewTaskRef.current = null;
    };
  });
  return null;
}

/**
 * Unified 3-panel layout for both org home and agent routes.
 * Panel sizes and visibility are driven by usePanelState (URL querystring).
 * Keyed by virtualMcpId + taskId — only remounts on agent or task switch.
 * Panel toggles use imperative setLayout() via PanelGroupRefContext.
 */
function UnifiedPanelGroup({
  virtualMcpId,
  taskId,
  isDecopilot,
  tasksOpen,
  mainOpen,
  chatOpen,
}: {
  virtualMcpId: string;
  taskId: string;
  isDecopilot: boolean;
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
}) {
  const sizes = computeDefaultSizes({ tasksOpen, mainOpen, chatOpen });
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — syncs panel layout from URL-derived state; imperative DOM API has no React 19 alternative
  useEffect(() => {
    const handle = panelGroupRef.current;
    if (!handle) return;
    const s = computeDefaultSizes({ tasksOpen, mainOpen, chatOpen });
    handle.setLayout([s.tasks, s.chat, s.main]);
  }, [tasksOpen, mainOpen, chatOpen]);

  return (
    <ResizablePanelGroup
      ref={panelGroupRef}
      key={`${virtualMcpId}-${taskId}`}
      direction="horizontal"
      className="flex-1 min-h-0 pb-1 pr-1 pl-0 pt-0"
      style={{ overflow: "visible" }}
    >
      <TasksResizablePanel defaultSize={sizes.tasks}>
        <div className="h-full p-0.5">
          <div className="h-full bg-background rounded-[0.75rem] overflow-hidden card-shadow">
            <TasksPanel />
          </div>
        </div>
      </TasksResizablePanel>
      <ResizableHandle className="bg-sidebar" />

      <PersistentResizablePanel defaultSize={sizes.chat}>
        <div className="h-full p-0.5">
          <div className="h-full bg-background rounded-[0.75rem] overflow-hidden card-shadow">
            <ActiveTaskBoundary variant={isDecopilot ? "home" : undefined} />
          </div>
        </div>
      </PersistentResizablePanel>

      <ResizableHandle className="bg-sidebar" />

      <ResizablePanel
        className="min-w-0 flex flex-col"
        order={3}
        defaultSize={sizes.main}
        style={{ overflow: "visible" }}
        collapsible={true}
        collapsedSize={0}
        minSize={20}
      >
        <div className="h-full p-0.5">
          <div
            className={cn(
              "flex flex-col h-full min-h-0 bg-background overflow-hidden",
              "card-shadow",
              "transition-[border-radius] duration-200 ease-[var(--ease-out-quart)]",
              "rounded-[0.75rem]",
            )}
          >
            <MainPanelWithTabs taskId={taskId} virtualMcpId={virtualMcpId} />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function MobileToolbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <div className="shrink-0 flex items-center justify-between px-3 h-12 bg-background border-b border-border">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex size-8 items-center justify-center rounded-md text-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Open menu"
      >
        <Menu01 size={20} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentInsetProvider — resolves virtualMcpId, provides InsetContext,
// wraps in Chat.Provider, renders 3-panel layout.
// ---------------------------------------------------------------------------

function AgentInsetProvider() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { org } = useProjectContext();

  // Org-wide SSE sound notifications
  useStatusSounds(org.id);

  // Route params: `/$org/$taskId[/$pluginId]`
  const params = useParams({ strict: false }) as {
    org?: string;
    taskId?: string;
    pluginId?: string;
  };
  const orgSlug = params.org ?? "";

  // Derive virtualMcpId from `?virtualmcpid=` or fall back to decopilot.
  // (When a task is loaded, its `virtual_mcp_id` field is authoritative, but
  // that resolution happens inside Chat.Provider via the task fetch.)
  const search = useSearch({ strict: false }) as {
    virtualmcpid?: string;
  };
  const virtualMcpId =
    search.virtualmcpid ?? getWellKnownDecopilotVirtualMCP(org.id).id;
  const isDecopilot = virtualMcpId === getDecopilotId(org.id);
  const isAgentRoute = !isDecopilot;
  const showThreePanels = true;

  // Fetch entity (Suspense-based — resolved before render)
  const entity = useVirtualMCP(virtualMcpId);

  // Derive entity layout metadata for usePanelState
  const layoutMetadata = (entity?.metadata as any)?.ui?.layout ?? null;
  const entityMetadata = layoutMetadata
    ? {
        defaultMainView: layoutMetadata.defaultMainView ?? null,
        chatDefaultOpen: layoutMetadata.chatDefaultOpen ?? null,
      }
    : null;

  // Fetch task count for default panel state (deduped with TaskListContent's fetch).
  const { tasks } = useTasks({
    owner: "all",
    status: "open",
    virtualMcpId,
  });

  // Layout state from URL querystring.
  // Route context is passed explicitly because usePanelState runs inside a pathless
  // layout that cannot see child route params via useMatch.
  const layout = usePanelState(
    entityMetadata,
    { virtualMcpId, orgSlug, isAgentRoute },
    tasks.length,
  );

  const { setOpenMobile, openMobile: mobileSidebarOpen } = useSidebar();
  const setMobileSidebarOpen = setOpenMobile;

  const onNewTask = useRef<(() => void) | null>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — subscribes to document keydown for ⇧⌘S new-task shortcut; DOM event listener has no React 19 alternative
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (isModKey(e) && e.shiftKey && e.code === "KeyS" && !e.repeat) {
        e.preventDefault();
        onNewTask.current?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Chat.Provider virtualMcpId
  const chatVirtualMcpId = virtualMcpId;

  // Not found — early return after all hooks
  if (!entity) {
    return (
      <div className="flex-1 min-h-0 pr-1.5 pb-1.5 overflow-hidden">
        <div className="flex flex-col h-full bg-background overflow-hidden card-shadow rounded-[0.75rem]">
          <EmptyState
            image={<AlertCircle size={48} className="text-muted-foreground" />}
            title="Agent not found"
            description={`The agent "${virtualMcpId}" does not exist in this organization.`}
            actions={
              <Button
                variant="outline"
                onClick={() =>
                  navigate({
                    to: "/$org",
                    params: { org: orgSlug },
                  })
                }
              >
                Go to organization home
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const insetContextValue: InsetContextValue = {
    virtualMcpId,
    entity,
  };

  // --- Mobile layout: full-screen with hamburger toolbar ---
  if (isMobile) {
    const mobileSidebarSheet = (
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          hideCloseButton
          className="w-[calc(100vw-3rem)] sm:max-w-md! p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full">
            {/* Icon sidebar rail — mirrors desktop collapsed sidebar */}
            <div
              className="w-14 shrink-0 bg-sidebar flex flex-col items-center border-r border-border overflow-y-auto group/sidebar"
              data-state="collapsed"
            >
              <StudioSidebarMobile
                onClose={() => setMobileSidebarOpen(false)}
              />
            </div>
            {/* Tasks / agent panel */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <TasksPanel />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );

    return (
      <InsetContext value={insetContextValue}>
        <div className="flex flex-col flex-1 bg-background min-h-0">
          <Chat.Provider key={chatVirtualMcpId} virtualMcpId={chatVirtualMcpId}>
            <NewTaskBridge
              onNewTaskRef={onNewTask}
              createNewTask={layout.createNewTask}
            />
            <MobileToolbar onOpenSidebar={() => setMobileSidebarOpen(true)} />
            <div className="flex-1 min-h-0 overflow-hidden">
              <ActiveTaskBoundary variant={isDecopilot ? "home" : undefined} />
            </div>
            {mobileSidebarSheet}
          </Chat.Provider>
        </div>
      </InsetContext>
    );
  }

  // --- Desktop layout ---
  return (
    <InsetContext value={insetContextValue}>
      <div className="shrink-0 flex items-center justify-between pl-1 pr-2 h-10">
        <div className="flex items-center gap-0.5 min-w-0">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title="Go back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => window.history.forward()}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title="Go forward"
          >
            <ChevronRight size={16} />
          </button>
          {isAgentRoute &&
            (() => {
              const activeRepo = getActiveGithubRepo(entity);
              return (
                <>
                  {activeRepo && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={`https://github.com/${activeRepo.owner}/${activeRepo.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                        >
                          <GitHubIcon size={14} />
                          <span className="max-w-32 truncate">
                            {activeRepo.owner}/{activeRepo.name}
                          </span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Open {activeRepo.owner}/{activeRepo.name} on GitHub
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              );
            })()}
        </div>
        <div className="flex items-center gap-0.5">
          {showThreePanels && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      onNewTask.current?.();
                    }}
                    aria-label="New task"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                  >
                    <Edit05 size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="flex items-center gap-1.5"
                >
                  New task
                  <span className="flex items-center gap-0.5">
                    {(isMac ? ["⇧", "⌘", "S"] : ["⇧", "Ctrl", "S"]).map(
                      (key) => (
                        <kbd
                          key={key}
                          className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-sm border border-white/20 bg-white/10 text-white/70 text-xs font-mono"
                        >
                          {key}
                        </kbd>
                      ),
                    )}
                  </span>
                </TooltipContent>
              </Tooltip>
              <div className="mx-1 h-4 w-px bg-sidebar-foreground/20" />
              <button
                type="button"
                onClick={layout.toggleTasks}
                aria-pressed={layout.tasksOpen}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                  layout.tasksOpen
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
                title="Toggle tasks"
              >
                <LayoutLeft size={16} />
              </button>
              <button
                type="button"
                onClick={layout.toggleMain}
                aria-pressed={layout.mainOpen}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  layout.mainOpen
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
                title="Toggle content"
              >
                <Browser size={16} />
              </button>
              <button
                type="button"
                onClick={layout.toggleChat}
                aria-pressed={layout.chatOpen}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  layout.chatOpen
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
                title="Toggle chat"
              >
                <LayoutRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <Chat.Provider key={chatVirtualMcpId} virtualMcpId={chatVirtualMcpId}>
        <NewTaskBridge
          onNewTaskRef={onNewTask}
          createNewTask={layout.createNewTask}
        />
        <UnifiedPanelGroup
          virtualMcpId={virtualMcpId}
          taskId={layout.taskId}
          isDecopilot={isDecopilot}
          tasksOpen={layout.tasksOpen}
          mainOpen={layout.mainOpen}
          chatOpen={layout.chatOpen}
        />
      </Chat.Provider>
    </InsetContext>
  );
}

// ---------------------------------------------------------------------------
// Default export — the shell layout component for agent routes
// ---------------------------------------------------------------------------

export default function AgentShellLayout() {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex flex-col h-dvh overflow-hidden">
        <SidebarLayout
          className="flex-1 bg-sidebar"
          style={
            {
              "--sidebar-width-icon": "3.5rem",
            } as Record<string, string>
          }
        >
          <StudioSidebar />
          <SidebarInset
            className="flex flex-col"
            style={{
              background: "transparent",
              containerType: "inline-size",
            }}
          >
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <Loading01
                    size={20}
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              }
            >
              <AgentInsetProvider />
            </Suspense>
          </SidebarInset>
        </SidebarLayout>
      </div>
    </SidebarProvider>
  );
}

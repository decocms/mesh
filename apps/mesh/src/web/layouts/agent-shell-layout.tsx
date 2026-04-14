/**
 * Agent Shell Layout
 *
 * Provides sidebar chrome (StudioSidebar) and the agent inset provider
 * (virtualMCP resolution, Chat.Provider, 3-panel resizable layout).
 * This layout wraps all agent and org-home routes via a pathless id route.
 */

import { createContext, use, useEffect, useLayoutEffect, useRef } from "react";
import { Chat, useChatTask } from "@/web/components/chat/index";
import { ChatPanel } from "@/web/components/chat/side-panel-chat";
import { TasksSidePanel } from "@/web/components/chat/side-panel-tasks";
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
  Terminal,
} from "@untitledui/icons";
import {
  getDecopilotId,
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import {
  Outlet,
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { PropsWithChildren, Suspense, useTransition } from "react";
import { useStatusSounds } from "../hooks/use-status-sounds";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import {
  computeDefaultSizes,
  usePanelState,
} from "@/web/hooks/use-layout-state";
import { GitHubRepoButton } from "@/web/components/github-repo-button";
import { usePreferences } from "@/web/hooks/use-preferences";
import { VmEnvContent } from "@/web/components/vm-env";

// ---------------------------------------------------------------------------
// Types & Context
// ---------------------------------------------------------------------------

export type MainViewType =
  | "chat"
  | "settings"
  | "automation"
  | "ext-apps"
  | "preview";

export type MainView =
  | { type: "chat" }
  | { type: "settings" }
  | { type: "automation"; id: string }
  | { type: "ext-apps"; id: string; toolName?: string; [key: string]: unknown }
  | { type: "preview" }
  | null;

export interface InsetContextValue {
  virtualMcpId: string;
  mainView: MainView;
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
      order={3}
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
          {children ?? <ChatPanel variant={variant} />}
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
  tasksVirtualMcpId,
  tasksOpen,
  mainOpen,
  chatOpen,
  envOpen,
  daemonOpen,
}: {
  virtualMcpId: string;
  taskId: string;
  isDecopilot: boolean;
  tasksVirtualMcpId: string;
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
  envOpen: boolean;
  daemonOpen: boolean;
}) {
  const sizes = computeDefaultSizes({ tasksOpen, mainOpen, chatOpen });
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — syncs panel layout from URL-derived state; imperative DOM API has no React 19 alternative
  useEffect(() => {
    const handle = panelGroupRef.current;
    if (!handle) return;
    const s = computeDefaultSizes({ tasksOpen, mainOpen, chatOpen });
    handle.setLayout([s.tasks, s.main, s.chat]);
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
            <TasksSidePanel
              virtualMcpId={tasksVirtualMcpId}
              hideProjectHeader={isDecopilot}
              showAutomations={!isDecopilot}
            />
          </div>
        </div>
      </TasksResizablePanel>
      <ResizableHandle className="bg-sidebar" />

      <ResizablePanel
        className="min-w-0 flex flex-col"
        order={2}
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
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel
                defaultSize={envOpen ? 60 : 100}
                minSize={20}
                order={1}
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
                  <div className="flex flex-1 items-center overflow-hidden h-full">
                    <Outlet />
                  </div>
                </Suspense>
              </ResizablePanel>
              {envOpen && (
                <>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={40} minSize={15} order={2}>
                    <VmEnvContent daemonOpen={daemonOpen} />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle className="bg-sidebar" />
      <PersistentResizablePanel defaultSize={sizes.chat}>
        <div className="h-full p-0.5">
          <div className="h-full bg-background rounded-[0.75rem] overflow-hidden card-shadow">
            <ActiveTaskBoundary variant={isDecopilot ? "home" : undefined} />
          </div>
        </div>
      </PersistentResizablePanel>
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

function MobileAgentContent({
  isDecopilot,
  mainOpen,
}: {
  isDecopilot: boolean;
  mainOpen: boolean;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {isDecopilot || !mainOpen ? (
        <ActiveTaskBoundary variant={isDecopilot ? "home" : undefined} />
      ) : (
        <Outlet />
      )}
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

  // Extract virtualMcpId from route params.
  // useMatch doesn't work here because the pathless agent-shell layout changes
  // the route ID hierarchy. useParams is safe — it reads from the resolved route.
  const params = useParams({ strict: false }) as {
    org?: string;
    virtualMcpId?: string;
  };
  const agentVirtualMcpId = params.virtualMcpId;
  const isAgentRoute = !!agentVirtualMcpId;
  const orgSlug = params.org ?? "";

  // Determine the effective virtualMcpId (agent or decopilot)
  const virtualMcpId =
    agentVirtualMcpId ?? getWellKnownDecopilotVirtualMCP(org.id).id;
  const isDecopilot = virtualMcpId === getDecopilotId(org.id);

  // Org home or agent route → always show 3-panel layout in agent shell
  const isOrgHome = !agentVirtualMcpId;
  const showThreePanels = isAgentRoute || isOrgHome;

  // Determine if we're on the agent/org "home" tab (no sub-route like /workflows).
  // URL structure: /shell/$org[/$virtualMcpId[/sub-route]]
  // pathSegments after split("/") and filtering: ["shell", org, virtualMcpId?, ...]
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathSegments = pathname.split("/").filter(Boolean);
  // "shell", org = 2 segments for org home; + virtualMcpId = 3 for agent home
  const isAgentHomeRoute =
    isOrgHome || (isAgentRoute && pathSegments.length <= 3);

  // Fetch entity (Suspense-based — resolved before render)
  const entity = useVirtualMCP(virtualMcpId);

  // Derive mainView from URL search params
  // NOTE: All hooks must be called before conditional returns (Rules of Hooks)
  const search = useSearch({ strict: false }) as {
    main?: string;
    id?: string;
    toolName?: string;
  };

  let mainView: MainView;
  if (search.main === "settings") {
    mainView = { type: "settings" };
  } else if (search.main === "automation") {
    const id = search.id ?? "";
    mainView = id ? { type: "automation", id } : { type: "settings" };
  } else if (search.main === "ext-apps") {
    const id = search.id ?? "";
    mainView = id
      ? { type: "ext-apps", id, toolName: search.toolName }
      : { type: "settings" };
  } else if (search.main === "preview") {
    mainView = { type: "preview" };
  } else {
    mainView = null;
  }

  // Derive entity layout metadata for usePanelState
  const layoutMetadata = (entity?.metadata as any)?.ui?.layout ?? null;
  const entityMetadata = layoutMetadata
    ? {
        defaultMainView: layoutMetadata.defaultMainView ?? null,
        chatDefaultOpen: layoutMetadata.chatDefaultOpen ?? null,
      }
    : null;

  // Layout state from URL querystring.
  // Route context is passed explicitly because usePanelState runs inside a pathless
  // layout that cannot see child route params via useMatch.
  const layout = usePanelState(entityMetadata, {
    virtualMcpId,
    orgSlug,
    isAgentRoute,
    isAgentHomeRoute,
  });

  // Tasks panel virtualMcpId
  const tasksVirtualMcpId = virtualMcpId;

  const [preferences] = usePreferences();
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

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — subscribes to document keydown for ⌘D toggle-daemon shortcut; DOM event listener has no React 19 alternative
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (isModKey(e) && !e.shiftKey && e.code === "KeyD" && !e.repeat) {
        e.preventDefault();
        layout.toggleDaemon();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [layout.toggleDaemon]);

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
    mainView,
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
              <TasksSidePanel
                virtualMcpId={showThreePanels ? tasksVirtualMcpId : undefined}
                hideProjectHeader={isDecopilot}
                showAutomations={!isDecopilot}
              />
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
            <MobileAgentContent
              isDecopilot={isDecopilot}
              mainOpen={layout.mainOpen}
            />
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
          {preferences.experimental_vibecode && <GitHubRepoButton />}
          {showThreePanels && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={layout.toggleEnv}
                  aria-pressed={layout.envOpen}
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                    layout.envOpen
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <Terminal size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Environment</TooltipContent>
            </Tooltip>
          )}
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
          tasksVirtualMcpId={tasksVirtualMcpId}
          tasksOpen={layout.tasksOpen}
          mainOpen={layout.mainOpen}
          chatOpen={layout.chatOpen}
          envOpen={layout.envOpen}
          daemonOpen={layout.daemonOpen}
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

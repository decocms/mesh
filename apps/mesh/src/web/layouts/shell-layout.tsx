import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Chat, useChatTask } from "@/web/components/chat/index";
import { ChatPanel } from "@/web/components/chat/side-panel-chat";
import { TasksSidePanel } from "@/web/components/chat/side-panel-tasks";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { SplashScreen } from "@/web/components/splash-screen";
import { KeyboardShortcutsDialog } from "@/web/components/keyboard-shortcuts-dialog";
import { isMac, isModKey } from "@/web/lib/keyboard-shortcuts";
import { StudioSidebar, StudioSidebarMobile } from "@/web/components/sidebar";
import {
  SettingsSidebar,
  SettingsSidebarMobile,
} from "@/web/layouts/settings-layout";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.tsx";
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
  ProjectContextProvider,
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Outlet,
  useMatch,
  useNavigate,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { PropsWithChildren, Suspense, useTransition } from "react";
import { KEYS } from "../lib/query-keys";
import { useOrgSsoStatus } from "../hooks/use-org-sso";
import { useStatusSounds } from "../hooks/use-status-sounds";
import { SsoRequiredScreen } from "../components/sso-required-screen";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import {
  computeDefaultSizes,
  usePanelState,
} from "@/web/hooks/use-layout-state";

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

type OrgSettingsPayload = {
  organizationId: string;
  enabled_plugins?: string[] | null;
};

/**
 * Single ProjectContextProvider for the entire shell.
 * Fetches org settings (enabledPlugins) and provides a complete project context.
 * Agent routes override this via VirtualMCPProvider.
 */
function ShellProjectProvider({
  org,
  children,
}: {
  org: NonNullable<Parameters<typeof ProjectContextProvider>[0]["org"]>;
  children: React.ReactNode;
}) {
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data: orgSettings } = useSuspenseQuery({
    queryKey: KEYS.organizationSettings(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "ORGANIZATION_SETTINGS_GET",
        arguments: {},
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return (payload ?? {}) as OrgSettingsPayload;
    },
    staleTime: 60_000,
  });

  const project = {
    id: org.id,
    organizationId: org.id,
    slug: "_org",
    name: org.name,
    enabledPlugins: orgSettings?.enabled_plugins ?? null,
    ui: null,
  };

  return (
    <ProjectContextProvider org={org} project={project}>
      {children}
    </ProjectContextProvider>
  );
}

function PersistentSidebarProvider({
  children,
  defaultOpen,
}: PropsWithChildren<{ defaultOpen?: boolean }>) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>{children}</SidebarProvider>
  );
}

// ---------------------------------------------------------------------------
// Panel actions — provider-free hook, works anywhere in the router tree.
// All actions just update URL search params via navigate().
// ---------------------------------------------------------------------------

export type MainViewType = "chat" | "settings" | "automation" | "ext-apps";

export type MainView =
  | { type: "chat" }
  | { type: "settings" }
  | { type: "automation"; id: string }
  | { type: "ext-apps"; id: string; toolName?: string; [key: string]: unknown }
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

export function usePanelActions() {
  const navigate = useNavigate();

  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });
  const orgHomeMatch = useMatch({
    from: "/shell/$org/",
    shouldThrow: false,
  });

  const orgSlug = agentsMatch?.params.org ?? orgHomeMatch?.params.org ?? "";
  const isAgentRoute = !!agentsMatch;
  const virtualMcpId = agentsMatch?.params.virtualMcpId ?? "";

  const routeBase = isAgentRoute
    ? ("/$org/$virtualMcpId/" as const)
    : ("/$org/" as const);
  const routeParams = isAgentRoute
    ? { org: orgSlug, virtualMcpId }
    : { org: orgSlug };

  const nav = (
    searchFn: (prev: Record<string, unknown>) => Record<string, unknown>,
    replace = true,
  ) =>
    navigate({
      to: routeBase,
      params: routeParams,
      search: searchFn,
      replace,
    });

  const setChatOpen = (open: boolean) =>
    nav((prev) => ({ ...prev, chat: open ? 1 : 0 }));

  const setTasksOpen = (open: boolean) =>
    nav((prev) => ({ ...prev, tasks: open ? 1 : 0 }));

  const setTaskId = (id: string) =>
    nav((prev) => {
      const next: Record<string, unknown> = { taskId: id };
      if (prev.tasks) next.tasks = prev.tasks;
      return next;
    }, false);

  const createNewTask = () => {
    const newTaskId = crypto.randomUUID();
    nav((prev) => {
      const next: Record<string, unknown> = {
        taskId: newTaskId,
        chat: 1,
      };
      if (prev.tasks) next.tasks = prev.tasks;
      return next;
    }, false);
  };

  const openMainView = (
    view: string,
    opts?: { id?: string; toolName?: string },
  ) => {
    if (view === "default") {
      nav((prev) => {
        const next: Record<string, unknown> = {};
        if (prev.taskId) next.taskId = prev.taskId;
        if (prev.tasks) next.tasks = prev.tasks;
        if (prev.mainOpen) next.mainOpen = prev.mainOpen;
        if (prev.chat) next.chat = prev.chat;
        return next;
      });
      return;
    }

    nav((prev) => {
      const next: Record<string, unknown> = {
        ...prev,
        main: view,
        mainOpen: 1,
      };
      if (opts?.id) next.id = opts.id;
      if (opts?.toolName) next.toolName = opts.toolName;
      return next;
    });
  };

  const closeMainView = () =>
    nav((prev) => {
      const next: Record<string, unknown> = {};
      if (prev.taskId) next.taskId = prev.taskId;
      if (prev.tasks) next.tasks = prev.tasks;
      if (prev.chat) next.chat = prev.chat;
      next.mainOpen = 0;
      return next;
    });

  return {
    setChatOpen,
    setTasksOpen,
    setTaskId,
    createNewTask,
    openMainView,
    closeMainView,
  };
}

/**
 * InsetProvider — unified content provider for the SidebarInset area.
 *
 * Resolves virtualMcpId, fetches entity (Suspense-based), provides
 * VirtualMCPContext + PanelContext, and renders toolbar + panel layout.
 * Lives inside SidebarInset so the sidebar is never suspended on agent switch.
 */
function InsetProvider({ isSettingsRoute }: { isSettingsRoute: boolean }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { org } = useProjectContext();

  // Org-wide SSE sound notifications
  useStatusSounds(org.id);

  // Extract virtualMcpId from route for agent context
  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });
  const orgHomeMatch = useMatch({
    from: "/shell/$org/",
    shouldThrow: false,
  });
  const agentVirtualMcpId = agentsMatch?.params.virtualMcpId;
  const isAgentRoute = !!agentsMatch && !isSettingsRoute;
  const orgSlug = agentsMatch?.params.org ?? orgHomeMatch?.params.org ?? "";

  // Determine the effective virtualMcpId (agent or decopilot)
  const virtualMcpId =
    agentVirtualMcpId ?? getWellKnownDecopilotVirtualMCP(org.id).id;
  const isDecopilot = virtualMcpId === getDecopilotId(org.id);

  // Org home or agent route → show 3-panel layout
  const isOrgHome = !agentVirtualMcpId && !isSettingsRoute;
  const showThreePanels = isAgentRoute || isOrgHome;

  // Fetch entity (Suspense-based — resolved before render)
  const entity = useVirtualMCP(virtualMcpId);

  // Not found
  if (!entity) {
    return (
      <div className="flex-1 min-h-0 pr-1.5 pb-1.5 overflow-hidden">
        <div className="flex flex-col h-full bg-card overflow-hidden border border-sidebar-border shadow-sm rounded-[0.75rem]">
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

  // Derive mainView from URL search params
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
  } else {
    mainView = null;
  }

  const insetContextValue: InsetContextValue = {
    virtualMcpId,
    mainView,
    entity,
  };

  // Derive entity layout metadata for usePanelState
  const layoutMetadata = (entity?.metadata as any)?.ui?.layout ?? null;
  const entityMetadata = layoutMetadata
    ? {
        defaultMainView: layoutMetadata.defaultMainView ?? null,
        chatDefaultOpen: layoutMetadata.chatDefaultOpen ?? null,
      }
    : null;

  // Layout state from URL querystring
  const layout = usePanelState(entityMetadata);

  // Tasks panel virtualMcpId
  const tasksVirtualMcpId = virtualMcpId;

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
          {isSettingsRoute ? (
            <SettingsSidebarMobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          ) : (
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
          )}
        </SheetContent>
      </Sheet>
    );

    if (showThreePanels) {
      return (
        <InsetContext value={insetContextValue}>
          <div className="flex flex-col flex-1 bg-background min-h-0">
            <Chat.Provider
              key={chatVirtualMcpId}
              virtualMcpId={chatVirtualMcpId}
            >
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

    return (
      <InsetContext value={insetContextValue}>
        <div className="flex flex-col flex-1 bg-background min-h-0">
          <MobileToolbar onOpenSidebar={() => setMobileSidebarOpen(true)} />
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
          {mobileSidebarSheet}
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
        {showThreePanels ? (
          <UnifiedPanelGroup
            virtualMcpId={virtualMcpId}
            isDecopilot={isDecopilot}
            tasksVirtualMcpId={tasksVirtualMcpId}
            tasksOpen={layout.tasksOpen}
            mainOpen={layout.mainOpen}
            chatOpen={layout.chatOpen}
          />
        ) : (
          <div className="flex-1 min-h-0 p-0.5 pb-1 pr-1">
            <div
              className={cn(
                "flex flex-col h-full min-h-0 bg-card overflow-hidden",
                "border border-sidebar-border shadow-sm",
                "rounded-[0.75rem]",
              )}
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
                <div className="flex flex-1 items-center overflow-hidden rounded-[inherit]">
                  <Outlet />
                </div>
              </Suspense>
            </div>
          </div>
        )}
      </Chat.Provider>
    </InsetContext>
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
 * Keyed by virtualMcpId + panel open/closed state so the panel group remounts
 * with correct deterministic sizes when any panel is toggled.
 */
function UnifiedPanelGroup({
  virtualMcpId,
  isDecopilot,
  tasksVirtualMcpId,
  tasksOpen,
  mainOpen,
  chatOpen,
}: {
  virtualMcpId: string;
  isDecopilot: boolean;
  tasksVirtualMcpId: string;
  tasksOpen: boolean;
  mainOpen: boolean;
  chatOpen: boolean;
}) {
  const sizes = computeDefaultSizes({ tasksOpen, mainOpen, chatOpen });

  return (
    <ResizablePanelGroup
      key={`${virtualMcpId}-${tasksOpen}-${mainOpen}-${chatOpen}`}
      direction="horizontal"
      className="flex-1 min-h-0 pb-1 pr-1 pl-0 pt-0"
      style={{ overflow: "visible" }}
    >
      <TasksResizablePanel defaultSize={sizes.tasks}>
        <div className="h-full p-0.5 overflow-hidden">
          <div className="h-full bg-background rounded-[0.75rem] overflow-hidden border border-sidebar-border shadow-sm">
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
        <div className="h-full p-0.5 overflow-hidden">
          <div
            className={cn(
              "flex flex-col h-full min-h-0 bg-card overflow-hidden",
              "border border-sidebar-border shadow-sm",
              "transition-[border-radius] duration-200 ease-[var(--ease-out-quart)]",
              "rounded-[0.75rem]",
            )}
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
              <div className="flex flex-1 items-center overflow-hidden rounded-[inherit]">
                <Outlet />
              </div>
            </Suspense>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle className="bg-sidebar" />
      <PersistentResizablePanel defaultSize={sizes.chat}>
        <div className="h-full p-0.5">
          <div className="h-full bg-background rounded-[0.75rem] overflow-hidden border border-sidebar-border shadow-sm">
            <ActiveTaskBoundary variant={isDecopilot ? "home" : undefined} />
          </div>
        </div>
      </PersistentResizablePanel>
    </ResizablePanelGroup>
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

function ShellLayoutContent() {
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const org = orgMatch?.params.org;
  const routerState = useRouterState();
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — subscribes to document keydown for ⌘K shortcuts dialog; DOM event listener has no React 19 alternative
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (isModKey(e) && e.code === "KeyK") {
        e.preventDefault();
        setShortcutsDialogOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Check if we're on settings routes (/$org/settings/*)
  const isSettingsRoute = routerState.location.pathname.startsWith(
    `/${org}/settings`,
  );

  const { data: activeOrg } = useSuspenseQuery({
    queryKey: KEYS.activeOrganization(org),
    queryFn: async () => {
      if (!org) {
        return null;
      }

      const { data } = await authClient.organization.setActive({
        organizationSlug: org,
      });

      // Persist for fast redirect on next login (read by homeRoute beforeLoad)
      // Only write on success to avoid caching an invalid slug
      if (data) {
        localStorage.setItem(LOCALSTORAGE_KEYS.lastOrgSlug(), org);
      }

      return data;
    },
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Check org-level SSO enforcement (must be before early returns to satisfy Rules of Hooks)
  const orgId = activeOrg?.id;
  const { data: ssoStatus } = useOrgSsoStatus(orgId);

  if (!activeOrg) {
    return <SplashScreen />;
  }

  if (ssoStatus?.ssoRequired && !ssoStatus.authenticated) {
    return (
      <SsoRequiredScreen
        orgId={activeOrg.id}
        orgName={activeOrg.name}
        domain={ssoStatus.domain}
      />
    );
  }

  return (
    <ShellProjectProvider org={{ ...activeOrg, logo: activeOrg.logo ?? null }}>
      <PersistentSidebarProvider defaultOpen={isSettingsRoute}>
        <div className="flex flex-col h-dvh overflow-hidden">
          <SidebarLayout
            className="flex-1 bg-sidebar"
            style={
              {
                "--sidebar-width-icon": "3.5rem",
              } as Record<string, string>
            }
          >
            {isSettingsRoute ? <SettingsSidebar /> : <StudioSidebar />}
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
                <InsetProvider isSettingsRoute={isSettingsRoute} />
              </Suspense>
            </SidebarInset>
          </SidebarLayout>
        </div>
      </PersistentSidebarProvider>

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </ShellProjectProvider>
  );
}

export default function ShellLayout() {
  return (
    <RequiredAuthLayout>
      <ShellLayoutContent />
    </RequiredAuthLayout>
  );
}

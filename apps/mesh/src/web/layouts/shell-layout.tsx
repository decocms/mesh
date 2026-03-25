import { useEffect, useRef, useState } from "react";
import { Chat } from "@/web/components/chat/index";
import { ChatPanel } from "@/web/components/chat/side-panel-chat";
import { TasksSidePanel } from "@/web/components/chat/side-panel-tasks";
import { KeyboardShortcutsDialog } from "@/web/components/keyboard-shortcuts-dialog";
import { isModKey } from "@/web/lib/keyboard-shortcuts";
import { MeshSidebar } from "@/web/components/sidebar";
import { SettingsSidebar } from "@/web/layouts/settings-layout";
import { SplashScreen } from "@/web/components/splash-screen";
import { MeshUserMenu } from "@/web/components/user-menu.tsx";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useDecoMainOpen } from "@/web/hooks/use-deco-main-open";
import { useDecoTasksOpen } from "@/web/hooks/use-deco-tasks-open";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { Drawer, DrawerContent } from "@deco/ui/components/drawer.tsx";
import {
  type ImperativePanelHandle,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deco/ui/components/resizable.tsx";
import {
  SidebarInset,
  SidebarLayout,
  SidebarProvider,
} from "@deco/ui/components/sidebar.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import {
  Browser,
  ChevronLeft,
  ChevronRight,
  LayoutLeft,
  MessageTextCircle02,
} from "@untitledui/icons";
import {
  getWellKnownDecopilotVirtualMCP,
  ProjectContextProvider,
  ProjectContextProviderProps,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, useMatch, useRouterState } from "@tanstack/react-router";
import { PropsWithChildren, Suspense, useTransition } from "react";
import { KEYS } from "../lib/query-keys";
import { useOrgSsoStatus } from "../hooks/use-org-sso";
import { SsoRequiredScreen } from "../components/sso-required-screen";

/**
 * This component persists the width of the chat panel across reloads.
 * Also, it's important to keep it like this to avoid unnecessary re-renders.
 */
function PersistentResizablePanel({
  children,
  panelRef,
  defaultCollapsed,
  defaultFullWidth,
  onCollapse,
  onExpand,
}: PropsWithChildren<{
  panelRef: React.RefObject<ImperativePanelHandle | null>;
  defaultCollapsed: boolean;
  defaultFullWidth?: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}>) {
  const [_isPending, startTransition] = useTransition();
  const [chatPanelWidth, setChatPanelWidth] = useLocalStorage(
    LOCALSTORAGE_KEYS.decoChatPanelWidth(),
    25,
  );

  const handleResize = (size: number) =>
    startTransition(() => {
      if (size > 0) setChatPanelWidth(size);
    });

  const defaultSize = defaultCollapsed
    ? 0
    : defaultFullWidth
      ? 100
      : chatPanelWidth;

  return (
    <ResizablePanel
      ref={panelRef}
      defaultSize={defaultSize}
      minSize={20}
      collapsible={true}
      collapsedSize={0}
      onCollapse={onCollapse}
      onExpand={onExpand}
      className="min-w-0 overflow-hidden bg-sidebar"
      onResize={handleResize}
      order={3}
    >
      {children}
    </ResizablePanel>
  );
}

/**
 * Persists the width of the tasks panel across reloads.
 */
function PersistentTasksResizablePanel({
  children,
  panelRef,
  defaultCollapsed,
  onCollapse,
  onExpand,
}: PropsWithChildren<{
  panelRef: React.RefObject<ImperativePanelHandle | null>;
  defaultCollapsed: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}>) {
  return (
    <ResizablePanel
      ref={panelRef}
      defaultSize={defaultCollapsed ? 0 : 22}
      minSize={22}
      maxSize={22}
      collapsible={true}
      collapsedSize={0}
      onCollapse={onCollapse}
      onExpand={onExpand}
      className="min-w-0 overflow-hidden bg-sidebar"
      order={1}
    >
      {children}
    </ResizablePanel>
  );
}

function PersistentSidebarProvider({ children }: PropsWithChildren) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

function MobileFABsAndDrawers({
  chatOpen,
  setChatOpen,
  tasksVirtualMcpId,
  chatVariant,
}: {
  chatOpen: boolean;
  setChatOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  tasksVirtualMcpId?: string;
  chatVariant?: "home" | "default";
}) {
  const [tasksOpen, setTasksOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setTasksOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-4 left-4 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-colors",
          tasksOpen
            ? "bg-accent text-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        aria-label="Toggle tasks"
      >
        <LayoutLeft size={20} />
      </button>
      <button
        type="button"
        onClick={() => setChatOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-colors",
          chatOpen
            ? "bg-accent text-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        aria-label="Toggle chat"
      >
        <MessageTextCircle02 size={20} />
      </button>
      <Drawer open={chatOpen} onOpenChange={setChatOpen} direction="bottom">
        <DrawerContent className="h-[95dvh] max-h-[95dvh]">
          <ChatPanel variant={chatVariant} />
        </DrawerContent>
      </Drawer>
      <Drawer open={tasksOpen} onOpenChange={setTasksOpen} direction="bottom">
        <DrawerContent className="h-[95dvh] max-h-[95dvh]">
          <TasksSidePanel virtualMcpId={tasksVirtualMcpId} />
        </DrawerContent>
      </Drawer>
    </>
  );
}

function ToolbarBreadcrumb() {
  const routerState = useRouterState();
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const org = orgMatch?.params.org;

  const isSpacesList =
    org && routerState.location.pathname === `/${org}/spaces`;

  if (isSpacesList) {
    return (
      <div className="flex items-center min-w-0 ml-1.5">
        <span className="text-sm font-medium text-sidebar-foreground">
          Spaces
        </span>
      </div>
    );
  }

  return null;
}

function ShellLayoutInner({
  isSpaceRoute,
  isOrgHome,
  isSettingsRoute,
}: {
  isSpaceRoute: boolean;
  isOrgHome: boolean;
  isSettingsRoute: boolean;
}) {
  const [chatOpen, setChatOpen] = useDecoChatOpen();
  const [tasksOpen, setTasksOpen] = useDecoTasksOpen();
  const [mainOpen, setMainOpen] = useDecoMainOpen();
  const isMobile = useIsMobile();
  const { org } = useProjectContext();

  const showThreePanels = isSpaceRoute || isOrgHome;

  // Compute decopilot virtualMcpId for tasks filtering on org home
  const tasksVirtualMcpId = isOrgHome
    ? getWellKnownDecopilotVirtualMCP(org.id).id
    : undefined;

  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const tasksPanelRef = useRef<ImperativePanelHandle>(null);
  const mainPanelRef = useRef<ImperativePanelHandle>(null);

  // --- State → panel ref sync effects ---

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (chatOpen) chatPanelRef.current?.expand();
    else chatPanelRef.current?.collapse();
  }, [chatOpen]);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (tasksOpen) tasksPanelRef.current?.expand();
    else tasksPanelRef.current?.collapse();
  }, [tasksOpen]);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (mainOpen) mainPanelRef.current?.expand();
    else mainPanelRef.current?.collapse();
  }, [mainOpen]);

  // --- Route-change effects (set state only, refs sync via above) ---

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    setTasksOpen(isSpaceRoute);
  }, [isSpaceRoute]);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    setMainOpen(!isOrgHome);
  }, [isOrgHome]);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (isSpaceRoute || isOrgHome) setChatOpen(true);
  }, [isSpaceRoute, isOrgHome]);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (isSettingsRoute) setChatOpen(false);
  }, [isSettingsRoute]);

  // --- Toggle handlers with all-panels-collapsed guard ---

  const expandedCount = [tasksOpen, mainOpen, chatOpen].filter(Boolean).length;

  const toggleTasks = () => {
    if (tasksOpen && expandedCount <= 1) return;
    setTasksOpen((prev) => !prev);
  };
  const toggleMain = () => {
    if (mainOpen && expandedCount <= 1) return;
    setMainOpen((prev) => !prev);
  };
  const toggleChat = () => {
    if (chatOpen && expandedCount <= 1) return;
    setChatOpen((prev) => !prev);
  };

  // Either panel open means the content card gets right rounding
  const hasRightPanel = !isMobile && chatOpen && showThreePanels;

  return (
    <SidebarLayout
      className="flex-1 bg-sidebar"
      style={
        {
          "--sidebar-width-icon": "3.5rem",
        } as Record<string, string>
      }
    >
      {isSettingsRoute ? <SettingsSidebar /> : <MeshSidebar />}
      {/* SidebarInset: transparent so bg-sidebar from SidebarLayout shows
          through the rounded corners of the inner card */}
      <SidebarInset
        className="flex flex-col"
        style={{ background: "transparent", containerType: "inline-size" }}
      >
        {/* Top toolbar — sits in the sidebar-colored area above all panels */}
        {!isMobile && (
          <div className="shrink-0 flex items-center justify-between px-2 h-10">
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
              <ToolbarBreadcrumb />
            </div>
            {showThreePanels && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={toggleTasks}
                  aria-pressed={tasksOpen}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    tasksOpen
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                  title="Toggle tasks"
                >
                  <LayoutLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={toggleMain}
                  aria-pressed={mainOpen}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    mainOpen
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                  title="Toggle content"
                >
                  <Browser size={16} />
                </button>
                <button
                  type="button"
                  onClick={toggleChat}
                  aria-pressed={chatOpen}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    chatOpen
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                  title="Toggle chat"
                >
                  <MessageTextCircle02 size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 min-h-0"
          style={{ overflow: "visible" }}
        >
          {/* Desktop: Tasks panel on the left */}
          {!isMobile && showThreePanels && (
            <>
              <PersistentTasksResizablePanel
                panelRef={tasksPanelRef}
                defaultCollapsed={!isSpaceRoute}
                onCollapse={() => setTasksOpen(false)}
                onExpand={() => setTasksOpen(true)}
              >
                <div className="h-full pr-1.5 pb-1.5 overflow-hidden">
                  <div className="h-full bg-background rounded-[0.75rem] overflow-hidden border border-sidebar-border shadow-sm">
                    <TasksSidePanel virtualMcpId={tasksVirtualMcpId} />
                  </div>
                </div>
              </PersistentTasksResizablePanel>
              <ResizableHandle className="bg-sidebar" />
            </>
          )}

          {/* Main content */}
          <ResizablePanel
            ref={mainPanelRef}
            className="min-w-0 flex flex-col"
            order={2}
            style={{ overflow: "visible" }}
            defaultSize={isOrgHome ? 0 : undefined}
            collapsible={showThreePanels}
            collapsedSize={0}
            minSize={showThreePanels ? 20 : undefined}
            onCollapse={() => setMainOpen(false)}
            onExpand={() => setMainOpen(true)}
          >
            <div
              className={cn(
                "h-full pb-1.5 overflow-hidden",
                !hasRightPanel && "pr-1.5",
              )}
            >
              <div
                className={cn(
                  "flex flex-col h-full min-h-0 bg-card overflow-hidden",
                  "border border-sidebar-border shadow-sm",
                  "transition-[border-radius] duration-200 ease-[var(--ease-out-quart)]",
                  "rounded-[0.75rem]",
                )}
              >
                <div className="flex-1 overflow-hidden">
                  <Outlet />
                </div>
              </div>
            </div>
          </ResizablePanel>

          {/* Desktop: Chat card as resizable side panel */}
          {showThreePanels && !isMobile && (
            <>
              <ResizableHandle className="bg-sidebar" />
              <PersistentResizablePanel
                panelRef={chatPanelRef}
                defaultCollapsed={false}
                defaultFullWidth={isOrgHome}
                onCollapse={() => setChatOpen(false)}
                onExpand={() => setChatOpen(true)}
              >
                <div className="h-full pl-1.5 pr-1.5 pb-1.5">
                  <div className="h-full bg-background rounded-[0.75rem] overflow-hidden border border-sidebar-border shadow-sm">
                    <ChatPanel variant={isOrgHome ? "home" : undefined} />
                  </div>
                </div>
              </PersistentResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </SidebarInset>

      {/* Mobile: FABs + bottom Drawers */}
      {showThreePanels && isMobile && (
        <MobileFABsAndDrawers
          chatOpen={chatOpen}
          setChatOpen={setChatOpen}
          tasksVirtualMcpId={tasksVirtualMcpId}
          chatVariant={isOrgHome ? "home" : undefined}
        />
      )}
    </SidebarLayout>
  );
}

function ShellLayoutContent() {
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const org = orgMatch?.params.org;
  const routerState = useRouterState();
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
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

  // Check if we're on a space route (/$org/spaces/$id or /$org/projects/$id) but not settings
  const isSpaceRoute =
    (routerState.location.pathname.startsWith(`/${org}/spaces/`) ||
      routerState.location.pathname.startsWith(`/${org}/projects/`)) &&
    !routerState.location.pathname.includes("/settings");

  // Check if we're on the org home route (/$org or /$org/)
  const isOrgHome =
    routerState.location.pathname === `/${org}` ||
    routerState.location.pathname === `/${org}/`;

  // Check if we're on settings routes (/$org/settings/*)
  const isSettingsRoute = routerState.location.pathname.startsWith(
    `/${org}/settings`,
  );

  const { data: projectContext } = useSuspenseQuery({
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

      return {
        org: data,
        // Provide a minimal project stub at shell level.
        // The org-layout and virtual-mcp-layout will override with proper context.
        project: {
          id: data?.id ?? "_org",
          slug: "_org",
          isOrgAdmin: true,
        },
      } as ProjectContextProviderProps;
    },
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Check org-level SSO enforcement (must be before early returns to satisfy Rules of Hooks)
  const orgId = projectContext?.org?.id;
  const { data: ssoStatus } = useOrgSsoStatus(orgId);

  if (!projectContext) {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-12 flex items-center justify-end px-4 border-b border-border">
          <div className="w-fit">
            <MeshUserMenu />
          </div>
        </header>
        <Outlet />
      </div>
    );
  }

  // If org parameter exists but organization is invalid/doesn't exist, redirect to home
  if (!projectContext.org) {
    // Prevent infinite redirect loop - only redirect if not already at home
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
    return null;
  }

  if (ssoStatus?.ssoRequired && !ssoStatus.authenticated) {
    return (
      <SsoRequiredScreen
        orgId={projectContext.org.id}
        orgName={projectContext.org.name}
        domain={ssoStatus.domain}
      />
    );
  }

  return (
    <ProjectContextProvider {...projectContext}>
      <PersistentSidebarProvider>
        <div className="flex flex-col h-dvh overflow-hidden">
          <Chat.Provider>
            <ShellLayoutInner
              isSpaceRoute={isSpaceRoute}
              isOrgHome={isOrgHome}
              isSettingsRoute={isSettingsRoute}
            />
          </Chat.Provider>
        </div>
      </PersistentSidebarProvider>

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </ProjectContextProvider>
  );
}

export default function ShellLayout() {
  return (
    <RequiredAuthLayout>
      <Suspense fallback={<SplashScreen />}>
        <ShellLayoutContent />
      </Suspense>
    </RequiredAuthLayout>
  );
}

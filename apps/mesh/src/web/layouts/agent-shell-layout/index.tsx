/**
 * Agent Shell Layout
 *
 * Desktop layout:
 *   SidebarInset
 *   ├── Toolbar                            (outside Suspense)
 *   │   • Toolbar.Nav (back/forward)
 *   │   • Toolbar.TabsSlot    (portal target — main-panel tab bar)
 *   │   • Toolbar.TogglesSlot (portal target — tasks/chat)
 *   └── flex-row
 *       ├── TasksPanelColumn               (outside Suspense, 212px fixed)
 *       └── Suspense
 *           └── AgentInsetProvider
 *               • useVirtualMCP (suspends here)
 *               • Toolbar.Toggles → portal into slot
 *               • Toolbar.Tabs → portal into slot
 *               • Chat.Provider → ChatMainPanelGroup
 *
 * Mobile layout is unchanged (sheet-based tasks + chat).
 */

import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  use,
  Suspense,
} from "react";
import { Chat, useChatTask } from "@/web/components/chat/index";
import { ChatCenterPanel } from "@/web/layouts/chat-center-panel";
import { TasksPanel } from "@/web/layouts/tasks-panel";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { isModKey } from "@/web/lib/keyboard-shortcuts";
import { StudioSidebar, StudioSidebarMobile } from "@/web/components/sidebar";
import {
  SidebarInset,
  SidebarLayout,
  SidebarProvider,
  useSidebar,
} from "@deco/ui/components/sidebar.tsx";
import { Sheet, SheetContent, SheetTitle } from "@deco/ui/components/sheet.tsx";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import { AlertCircle, Loading01, Menu01 } from "@untitledui/icons";
import {
  getDecopilotId,
  getWellKnownDecopilotVirtualMCP,
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useVmStart } from "@/web/components/vm/hooks/use-vm-start";
import { useStatusSounds } from "../../hooks/use-status-sounds";
import { useChatNavigation } from "@/web/components/chat/hooks/use-chat-navigation";
import { generateBranchName } from "@/shared/branch-name";
import { authClient } from "@/web/lib/auth-client";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import { useChatMainPanelState } from "@/web/hooks/use-layout-state";
import { getActiveGithubRepo } from "@/web/lib/github-repo";
import { TasksPanelStateProvider } from "@/web/hooks/use-tasks-panel-state";
import { Toolbar } from "./toolbar";
import { TasksPanelColumn } from "./tasks-panel-column";
import { ChatMainPanelGroup } from "./chat-main-panel-group";
import { ToggleButtons } from "./toggle-buttons";
import { MainPanelTabsBar } from "@/web/layouts/main-panel-tabs/main-panel-tabs-bar";
import { VirtualMcpHeaderInfo } from "../../views/virtual-mcp/header-info.tsx";
import { VmEventsProvider } from "@/web/components/vm/hooks/vm-events-context.tsx";

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
// Agent inset sub-components
// ---------------------------------------------------------------------------

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
// wraps in Chat.Provider, renders chat+main panel group.
// ---------------------------------------------------------------------------

function AgentInsetProvider() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { org } = useProjectContext();

  useStatusSounds(org.id);

  const params = useParams({ strict: false }) as {
    org?: string;
    taskId?: string;
    pluginId?: string;
  };
  const orgSlug = params.org ?? "";

  const search = useSearch({ strict: false }) as {
    virtualmcpid?: string;
    branch?: string;
  };
  const virtualMcpId =
    search.virtualmcpid ?? getWellKnownDecopilotVirtualMCP(org.id).id;
  const isDecopilot = virtualMcpId === getDecopilotId(org.id);
  const isAgentRoute = !isDecopilot;

  // Fetch entity (Suspense-based — resolved before render)
  const entity = useVirtualMCP(virtualMcpId);

  const layoutMetadata = (entity?.metadata as any)?.ui?.layout ?? null;
  const entityMetadata = layoutMetadata
    ? {
        defaultMainView: layoutMetadata.defaultMainView ?? null,
        chatDefaultOpen: layoutMetadata.chatDefaultOpen ?? null,
      }
    : null;

  const hasActiveGithubRepo = !!(entity && getActiveGithubRepo(entity));

  const layout = useChatMainPanelState(
    entityMetadata,
    {
      virtualMcpId,
      orgSlug,
      isAgentRoute,
    },
    hasActiveGithubRepo,
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

  // Auto-assign a branch to the thread when the virtualMCP has a GitHub repo
  // and the URL has no `?branch=` yet. Prefer reusing the user's first
  // existing branch from vmMap (so revisits stick to a known branch instead
  // of minting a fresh name); fall back to generating one only when the user
  // has no branches registered yet.
  const { branch: urlBranch, setBranch } = useChatNavigation();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const vmMap = entity?.metadata?.vmMap;
  // daemonBaseUrl routing rationale: see VmEventsProvider.
  const vmEntry =
    userId && urlBranch ? (vmMap?.[userId]?.[urlBranch] ?? null) : null;
  const vmDaemonBaseUrl = vmEntry
    ? `/api/sandbox/${vmEntry.vmId}/_daemon`
    : null;
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — one-shot side effect that sets a URL search param; TanStack Router navigation has no render-time equivalent
  useEffect(() => {
    if (urlBranch) return;
    if (!hasActiveGithubRepo) return;
    if (!userId) return;
    const userBranches = vmMap?.[userId];
    const existing = userBranches ? Object.keys(userBranches)[0] : undefined;
    // URL only — runs outside Chat.Provider (no thread-persistence helpers).
    // createMemory writes thread.branch on the first stream request.
    setBranch(existing ?? generateBranchName());
  }, [urlBranch, hasActiveGithubRepo, setBranch, userId, vmMap]);

  // Auto-start the VM when the thread lands on a branch without a registered
  // entry. Routed through useVmStart so concurrent mounts (preview, env, this
  // layout) for the same (virtualMcpId, branch) collapse onto one in-flight
  // upstream call instead of stacking 10–30s container-create requests.
  const autoStartClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const autoStart = useVmStart(autoStartClient);
  const { mutate: triggerAutoStart } = autoStart;
  const autoStartingBranchRef = useRef<string | null>(null);
  // oxlint-disable-next-line ban-use-effect/ban-use-effect — fires VM_START when vmMap is missing an entry for (user, branch); ref guard dedupes within this mount, module-level map dedupes across components
  useEffect(() => {
    if (!hasActiveGithubRepo) return;
    if (!userId) return;
    if (!urlBranch) return;
    if (vmMap?.[userId]?.[urlBranch]) return;
    if (autoStartingBranchRef.current === urlBranch) return;
    autoStartingBranchRef.current = urlBranch;
    triggerAutoStart(
      { virtualMcpId, branch: urlBranch },
      {
        onError: (err) => {
          console.error("[auto-start-vm] failed:", err);
        },
        onSettled: () => {
          if (autoStartingBranchRef.current === urlBranch) {
            autoStartingBranchRef.current = null;
          }
        },
      },
    );
  }, [
    hasActiveGithubRepo,
    userId,
    urlBranch,
    vmMap,
    virtualMcpId,
    triggerAutoStart,
  ]);

  const chatVirtualMcpId = virtualMcpId;

  const insetContextValue: InsetContextValue = {
    virtualMcpId,
    entity,
  };

  if (!entity) {
    return (
      <InsetContext value={insetContextValue}>
        <div className="flex-1 min-h-0 pr-1.5 pb-1.5 overflow-hidden">
          <div className="flex flex-col h-full bg-background overflow-hidden card-shadow rounded-[0.75rem]">
            <EmptyState
              image={
                <AlertCircle size={48} className="text-muted-foreground" />
              }
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
      </InsetContext>
    );
  }

  // Mobile layout — unchanged semantics, just inlined here for clarity.
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
            <div
              className="w-14 shrink-0 bg-sidebar flex flex-col items-center border-r border-border overflow-y-auto group/sidebar"
              data-state="collapsed"
            >
              <StudioSidebarMobile
                onClose={() => setMobileSidebarOpen(false)}
              />
            </div>
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
            <VmEventsProvider daemonBaseUrl={vmDaemonBaseUrl}>
              <NewTaskBridge
                onNewTaskRef={onNewTask}
                createNewTask={layout.createNewTask}
              />
              <MobileToolbar onOpenSidebar={() => setMobileSidebarOpen(true)} />
              <div className="flex-1 min-h-0 overflow-hidden">
                <ActiveTaskBoundary
                  variant={isDecopilot ? "home" : undefined}
                />
              </div>
              {mobileSidebarSheet}
            </VmEventsProvider>
          </Chat.Provider>
        </div>
      </InsetContext>
    );
  }

  // Desktop — portal toggle buttons into outer toolbar, render chat+main group.
  return (
    <InsetContext value={insetContextValue}>
      <Toolbar.Toggles>
        <ToggleButtons
          isDecopilot={isDecopilot}
          chatOpen={layout.chatOpen}
          mainOpen={layout.mainOpen}
          toggleChat={layout.toggleChat}
          toggleMain={layout.toggleMain}
        />
      </Toolbar.Toggles>

      {!isDecopilot && (
        <Toolbar.Tabs>
          <MainPanelTabsBar
            virtualMcpId={virtualMcpId}
            taskId={layout.taskId}
          />
        </Toolbar.Tabs>
      )}

      <Chat.Provider key={chatVirtualMcpId} virtualMcpId={chatVirtualMcpId}>
        <VmEventsProvider daemonBaseUrl={vmDaemonBaseUrl}>
          {!isDecopilot && <VirtualMcpHeaderInfo virtualMcp={entity} />}
          <NewTaskBridge
            onNewTaskRef={onNewTask}
            createNewTask={layout.createNewTask}
          />
          <ChatMainPanelGroup
            virtualMcpId={virtualMcpId}
            taskId={layout.taskId}
            chatOpen={layout.chatOpen}
            mainOpen={layout.mainOpen}
            chatContent={
              <ActiveTaskBoundary variant={isDecopilot ? "home" : undefined} />
            }
          />
        </VmEventsProvider>
      </Chat.Provider>
    </InsetContext>
  );
}

// ---------------------------------------------------------------------------
// Default export — the shell layout component for agent routes
// ---------------------------------------------------------------------------

export default function AgentShellLayout() {
  const isMobile = useIsMobile();

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
            {isMobile ? (
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
            ) : (
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
                <TasksPanelStateProvider>
                  <Toolbar>
                    <Toolbar.Header>
                      <Toolbar.LeftColumn>
                        <Toolbar.Nav />
                        <Toolbar.TogglesSlot />
                      </Toolbar.LeftColumn>
                      <Toolbar.CenterSlot />
                      <Toolbar.RightColumn>
                        <Toolbar.TabsSlot />
                        <Toolbar.RightSlot />
                      </Toolbar.RightColumn>
                    </Toolbar.Header>
                    <div className="flex-1 min-h-0 flex flex-row">
                      <TasksPanelColumn />
                      <div className="flex-1 min-w-0 flex flex-col">
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
                      </div>
                    </div>
                  </Toolbar>
                </TasksPanelStateProvider>
              </Suspense>
            )}
          </SidebarInset>
        </SidebarLayout>
      </div>
    </SidebarProvider>
  );
}

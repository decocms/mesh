import { ErrorBoundary } from "@/web/components/error-boundary";
import { MeshSidebar } from "@/web/components/mesh-sidebar";
import { SplashScreen } from "@/web/components/splash-screen";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { ORG_ADMIN_PROJECT_SLUG } from "@/web/lib/locator";
import {
  ProjectContextProvider,
  ProjectContextProviderProps,
} from "@/web/providers/project-context-provider";
import { DecoChatSkeleton } from "@/web/components/chat/deco-chat-skeleton";
import {
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
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { PropsWithChildren, Suspense, useTransition } from "react";
import { KEYS } from "../lib/query-keys";
import { ChatPanel } from "@/web/components/chat/side-panel-chat";

/**
 * This component persists the width of the chat panel across reloads.
 * Also, it's important to keep it like this to avoid unnecessary re-renders.
 */
function PersistentResizablePanel({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const [_isPending, startTransition] = useTransition();
  const [chatPanelWidth, setChatPanelWidth] = useLocalStorage(
    LOCALSTORAGE_KEYS.decoChatPanelWidth(),
    30,
  );

  const handleResize = (size: number) =>
    startTransition(() => setChatPanelWidth(size));

  return (
    <ResizablePanel
      defaultSize={chatPanelWidth}
      minSize={20}
      className={cn("min-w-0", className)}
      onResize={handleResize}
    >
      {children}
    </ResizablePanel>
  );
}

/**
 * This component persists the open state of the sidebar across reloads.
 * Also, it's important to keep it like this to avoid unnecessary re-renders.
 */
function PersistentSidebarProvider({ children }: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useLocalStorage(
    LOCALSTORAGE_KEYS.sidebarOpen(),
    true,
  );

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      {children}
    </SidebarProvider>
  );
}

/**
 * This component renders the chat panel and the main content.
 * It's important to keep it like this to avoid unnecessary re-renders.
 */
function ChatPanels({ disableChat = false }: { disableChat?: boolean }) {
  const [chatOpen] = useDecoChatOpen();
  const shouldShowChat = chatOpen && !disableChat;

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel className="bg-background">
        <Outlet />
      </ResizablePanel>
      {!disableChat && <ResizableHandle withHandle={shouldShowChat} />}
      <PersistentResizablePanel
        className={shouldShowChat ? "max-w-none" : "max-w-0"}
      >
        <ErrorBoundary>
          <Suspense fallback={<DecoChatSkeleton />}>
            <ChatPanel />
          </Suspense>
        </ErrorBoundary>
      </PersistentResizablePanel>
    </ResizablePanelGroup>
  );
}

function ShellLayoutContent() {
  const { org } = useParams({ strict: false });
  const routerState = useRouterState();

  // Check if we're on the home route (/$org)
  const isHomeRoute =
    routerState.location.pathname === `/${org}` ||
    routerState.location.pathname === `/${org}/`;

  const { data: projectContext } = useSuspenseQuery({
    queryKey: KEYS.activeOrganization(org),
    queryFn: async () => {
      if (!org) {
        return null;
      }

      const { data } = await authClient.organization.setActive({
        organizationSlug: org,
      });

      return {
        org: data,
        project: { slug: ORG_ADMIN_PROJECT_SLUG },
      } as ProjectContextProviderProps;
    },
    gcTime: Infinity,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Should use "project ?? org-admin" when projects are introduced
  if (!projectContext) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <ProjectContextProvider {...projectContext}>
      <PersistentSidebarProvider>
        <SidebarLayout
          className="h-screen"
          style={
            {
              "--sidebar-width": "14rem",
              "--sidebar-width-mobile": "11rem",
            } as Record<string, string>
          }
        >
          <MeshSidebar />
          <SidebarInset>
            <ChatPanels disableChat={isHomeRoute} />
          </SidebarInset>
        </SidebarLayout>
      </PersistentSidebarProvider>
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

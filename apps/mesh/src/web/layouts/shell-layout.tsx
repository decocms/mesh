import { ErrorBoundary } from "@/web/components/error-boundary";
import { MeshSidebar } from "@/web/components/mesh-sidebar";
import { MeshOrgSwitcher } from "@/web/components/org-switcher";
import { SplashScreen } from "@/web/components/splash-screen";
import { ToolboxSidebar } from "@/web/components/toolbox-sidebar";
import { ToolboxSwitcher } from "@/web/components/toolbox-switcher";
import { MeshUserMenu } from "@/web/components/user-menu";
import { useGateway } from "@/web/hooks/collections/use-gateway";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { ORG_ADMIN_PROJECT_SLUG } from "@/web/lib/locator";
import {
  ProjectContextProvider,
  ProjectContextProviderProps,
} from "@/web/providers/project-context-provider";
import { ToolboxContextProvider } from "@/web/providers/toolbox-context-provider";
import { AppTopbar } from "@deco/ui/components/app-topbar.tsx";
import { SidebarToggleButton } from "@deco/ui/components/sidebar-toggle-button.tsx";
import {
  SidebarInset,
  SidebarLayout,
  SidebarProvider,
} from "@deco/ui/components/sidebar.tsx";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "@untitledui/icons";
import { PropsWithChildren, Suspense } from "react";
import { KEYS } from "../lib/query-keys";

/**
 * Check if we're in a toolbox route by examining the current path
 */
function useIsToolboxRoute(): { isToolbox: boolean; toolboxId: string | null } {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Match /$org/toolbox/$toolboxId pattern
  const match = pathname.match(/^\/[^/]+\/toolbox\/([^/]+)/);

  if (match && match[1]) {
    return { isToolbox: true, toolboxId: match[1] };
  }

  return { isToolbox: false, toolboxId: null };
}

function Topbar({
  showSidebarToggle = false,
  showOrgSwitcher = false,
  toolboxId,
}: {
  showSidebarToggle?: boolean;
  showOrgSwitcher?: boolean;
  toolboxId?: string | null;
}) {
  return (
    <AppTopbar>
      {showSidebarToggle && (
        <AppTopbar.Sidebar>
          <SidebarToggleButton />
        </AppTopbar.Sidebar>
      )}
      <AppTopbar.Left>
        <div className="flex items-center gap-1">
          {showOrgSwitcher && (
            <Suspense fallback={<MeshOrgSwitcher.Skeleton />}>
              <MeshOrgSwitcher />
            </Suspense>
          )}
          {/* Show toolbox switcher when in toolbox mode */}
          {toolboxId && (
            <>
              <ChevronRight size={14} className="text-muted-foreground" />
              <Suspense fallback={<ToolboxSwitcher.Skeleton />}>
                <ToolboxSwitcherWrapper toolboxId={toolboxId} />
              </Suspense>
            </>
          )}
        </div>
      </AppTopbar.Left>
      <AppTopbar.Right className="gap-2">
        <MeshUserMenu />
      </AppTopbar.Right>
    </AppTopbar>
  );
}

/**
 * Wrapper that fetches toolbox data and provides context for the switcher
 */
function ToolboxSwitcherWrapper({ toolboxId }: { toolboxId: string }) {
  const toolbox = useGateway(toolboxId);

  if (!toolbox) {
    return <ToolboxSwitcher.Skeleton />;
  }

  return (
    <ToolboxContextProvider toolbox={toolbox}>
      <ToolboxSwitcher />
    </ToolboxContextProvider>
  );
}

/**
 * This component persists the open state of the sidebar across reloads.
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
 * Sidebar that adapts based on route
 */
function AdaptiveSidebar({ toolboxId }: { toolboxId: string | null }) {
  if (toolboxId) {
    return (
      <Suspense fallback={null}>
        <ToolboxSidebarWrapper toolboxId={toolboxId} />
      </Suspense>
    );
  }

  return <MeshSidebar />;
}

/**
 * Wrapper that fetches toolbox data and provides context for the sidebar
 */
function ToolboxSidebarWrapper({ toolboxId }: { toolboxId: string }) {
  const toolbox = useGateway(toolboxId);

  if (!toolbox) {
    return null;
  }

  return (
    <ToolboxContextProvider toolbox={toolbox}>
      <ToolboxSidebar />
    </ToolboxContextProvider>
  );
}

function ShellLayoutContent() {
  const { org } = useParams({ strict: false });
  const { isToolbox, toolboxId } = useIsToolboxRoute();

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
        <Topbar />
        <div className="pt-12">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <ProjectContextProvider {...projectContext}>
      <PersistentSidebarProvider>
        <div className="flex flex-col h-screen">
          <Topbar
            showSidebarToggle
            showOrgSwitcher
            toolboxId={isToolbox ? toolboxId : null}
          />
          <SidebarLayout
            className="flex-1 bg-sidebar"
            style={
              {
                "--sidebar-width": "13rem",
                "--sidebar-width-mobile": "11rem",
              } as Record<string, string>
            }
          >
            <AdaptiveSidebar toolboxId={isToolbox ? toolboxId : null} />
            <SidebarInset className="pt-12">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </SidebarInset>
          </SidebarLayout>
        </div>
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

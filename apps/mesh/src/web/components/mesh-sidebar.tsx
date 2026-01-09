import { ErrorBoundary } from "@/web/components/error-boundary";
import { SidebarItemsSection } from "@/web/components/sidebar-items-section";
import { MeshOrgSwitcher } from "@/web/components/org-switcher";
import { MeshUserMenu } from "@/web/components/user-menu";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { NavigationSidebar } from "@deco/ui/components/navigation-sidebar.tsx";
import { useSidebar } from "@deco/ui/components/sidebar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { ChevronLeft, ChevronRight, MessageCircle02 } from "@untitledui/icons";
import { useParams, useRouterState } from "@tanstack/react-router";
import { authClient } from "@/web/lib/auth-client";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { Suspense, useState } from "react";

function CollapsedOrgToggle() {
  const [isHovered, setIsHovered] = useState(false);
  const { toggleSidebar } = useSidebar();
  const { org } = useParams({ strict: false });
  const { data: organizations } = authClient.useListOrganizations();

  const currentOrg = organizations?.find((o) => o.slug === org);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={toggleSidebar}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered ? (
        <ChevronRight size={18} />
      ) : (
        <Avatar
          url={currentOrg?.logo ?? ""}
          fallback={currentOrg?.name ?? org ?? ""}
          size="xs"
          objectFit="cover"
        />
      )}
    </Button>
  );
}

export function MeshSidebar() {
  const sidebarItems = useProjectSidebarItems();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const routerState = useRouterState();
  const { org } = useParams({ strict: false });
  const [chatOpen, setChatOpen] = useDecoChatOpen();

  // Check if we're on the home route (/$org)
  const isHomeRoute =
    routerState.location.pathname === `/${org}` ||
    routerState.location.pathname === `/${org}/`;

  const toggleChat = () => {
    setChatOpen(!chatOpen);
  };

  return (
    <NavigationSidebar
      navigationItems={sidebarItems}
      header={
        <div
          className={`flex items-center h-12 ${isCollapsed ? "justify-center" : "pl-2.5 pr-3.5"}`}
        >
          {isCollapsed ? (
            <CollapsedOrgToggle />
          ) : (
            <div className="flex items-center mt-2 w-full gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                <Suspense fallback={<MeshOrgSwitcher.Skeleton />}>
                  <MeshOrgSwitcher />
                </Suspense>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={toggleSidebar}
                  title="Collapse sidebar"
                >
                  <ChevronLeft size={16} />
                </Button>
                {!isHomeRoute && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    onClick={toggleChat}
                    title={chatOpen ? "Close chat" : "Open chat"}
                  >
                    <MessageCircle02 size={16} />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      }
      footer={<MeshUserMenu />}
      additionalContent={
        <>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarItemsSection />
            </Suspense>
          </ErrorBoundary>
        </>
      }
    />
  );
}

import { ErrorBoundary } from "@/web/components/error-boundary";
import { SidebarChatsSection } from "@/web/components/chat/sidebar-chats-section";
import { SidebarItemsSection } from "@/web/components/sidebar-items-section";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { NavigationSidebar } from "@deco/ui/components/navigation-sidebar.tsx";
import { Suspense } from "react";

export function MeshSidebar() {
  const sidebarItems = useProjectSidebarItems();

  return (
    <NavigationSidebar
      navigationItems={sidebarItems}
      additionalContent={
        <>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarItemsSection />
            </Suspense>
          </ErrorBoundary>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarChatsSection />
            </Suspense>
          </ErrorBoundary>
        </>
      }
    />
  );
}

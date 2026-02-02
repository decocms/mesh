import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { Suspense } from "react";
import { NavigationSidebar } from "./navigation";
import { MeshSidebarHeader } from "./header";
import { SidebarInboxFooter } from "./footer/inbox";
import { SidebarItemsSection } from "./items";
import { ThreadList } from "./thread-list";

// Export types for external use
export type { NavigationSidebarItem, Invitation } from "./types";

export function MeshSidebar() {
  const sidebarItems = useProjectSidebarItems();

  return (
    <NavigationSidebar
      navigationItems={sidebarItems}
      header={
        <Suspense fallback={<MeshSidebarHeader.Skeleton />}>
          <MeshSidebarHeader />
        </Suspense>
      }
      footer={<SidebarInboxFooter />}
      additionalContent={
        <ErrorBoundary>
          <Suspense fallback={null}>
            <SidebarItemsSection />
            <ThreadList />
          </Suspense>
        </ErrorBoundary>
      }
    />
  );
}

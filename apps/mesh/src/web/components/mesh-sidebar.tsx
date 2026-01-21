import { ErrorBoundary } from "@/web/components/error-boundary";
import { SidebarItemsSection } from "@/web/components/sidebar-items-section";
import { MeshSidebarHeader } from "@/web/components/sidebar-header";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { NavigationSidebar } from "@deco/ui/components/navigation-sidebar.tsx";
import { Suspense } from "react";

export function MeshSidebar() {
  const sidebarGroups = useProjectSidebarItems();

  return (
    <NavigationSidebar
      groups={sidebarGroups}
      header={
        <Suspense fallback={<MeshSidebarHeader.Skeleton />}>
          <MeshSidebarHeader />
        </Suspense>
      }
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

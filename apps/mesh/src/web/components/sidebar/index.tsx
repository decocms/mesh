import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { useIsOrgAdmin } from "@decocms/mesh-sdk";
import { Suspense } from "react";
import { NavigationSidebar } from "./navigation";
import { MeshSidebarHeader } from "./header";
import { SidebarInboxFooter } from "./footer/inbox";
import { SidebarSpacesSection } from "./spaces-section";

// Export types for external use
export type {
  NavigationSidebarItem,
  SidebarSection,
  SidebarItemGroup,
  Invitation,
} from "./types";

/**
 * Sidebar content that reads from the current ProjectContext.
 * Always renders org-level sidebar items.
 */
function SidebarContent() {
  const sidebarSections = useProjectSidebarItems();
  const isOrgAdmin = useIsOrgAdmin();

  return (
    <NavigationSidebar
      sections={sidebarSections}
      header={
        <Suspense fallback={<MeshSidebarHeader.Skeleton />}>
          <MeshSidebarHeader />
        </Suspense>
      }
      footer={<SidebarInboxFooter />}
      additionalContent={
        isOrgAdmin ? (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarSpacesSection />
            </Suspense>
          </ErrorBoundary>
        ) : null
      }
    />
  );
}

export function MeshSidebar() {
  return <SidebarContent />;
}

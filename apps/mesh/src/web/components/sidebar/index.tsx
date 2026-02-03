import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { Locator, useProjectContext } from "@decocms/mesh-sdk";
import { Suspense } from "react";
import { NavigationSidebar } from "./navigation";
import { MeshSidebarHeader } from "./header";
import { SidebarInboxFooter } from "./footer/inbox";
import { SidebarItemsSection } from "./items";

// Export types for external use
export type {
  NavigationSidebarItem,
  SidebarSection,
  SidebarItemGroup,
  Invitation,
} from "./types";

interface MeshSidebarProps {
  onCreateProject?: () => void;
}

export function MeshSidebar({ onCreateProject }: MeshSidebarProps) {
  const sidebarSections = useProjectSidebarItems();
  const { locator } = useProjectContext();
  const isOrgAdmin = Locator.isOrgAdminProject(locator);

  return (
    <NavigationSidebar
      sections={sidebarSections}
      header={
        <Suspense fallback={<MeshSidebarHeader.Skeleton />}>
          <MeshSidebarHeader onCreateProject={onCreateProject} />
        </Suspense>
      }
      footer={<SidebarInboxFooter />}
      additionalContent={
        <ErrorBoundary>
          <Suspense fallback={null}>
            <SidebarItemsSection />
          </Suspense>
        </ErrorBoundary>
      }
      contentClassName={!isOrgAdmin ? "pt-3" : undefined}
    />
  );
}

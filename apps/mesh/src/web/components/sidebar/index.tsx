import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { useIsOrgAdmin } from "@decocms/mesh-sdk";
import { Suspense } from "react";
import { NavigationSidebar } from "./navigation";
import { MobileNavigationSidebar } from "./navigation-mobile";
import { SidebarInboxFooter } from "./footer/inbox";
import { SidebarInboxFooterMobile } from "./footer/inbox-mobile";
import { SidebarAgentsSection } from "./agents-section";

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
      footer={<SidebarInboxFooter />}
      additionalContent={
        isOrgAdmin ? (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarAgentsSection />
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

/**
 * Mobile sidebar content — renders inline (no Sheet wrapper).
 * Used inside the mobile sidebar Sheet in shell-layout.
 */
export function MeshSidebarMobile({ onClose }: { onClose: () => void }) {
  const sidebarSections = useProjectSidebarItems();
  const isOrgAdmin = useIsOrgAdmin();

  return (
    <MobileNavigationSidebar
      sections={sidebarSections}
      onClose={onClose}
      footer={<SidebarInboxFooterMobile onClose={onClose} />}
      additionalContent={
        isOrgAdmin ? (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarAgentsSection />
            </Suspense>
          </ErrorBoundary>
        ) : null
      }
    />
  );
}

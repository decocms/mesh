import { Locator, useProjectContext } from "@decocms/mesh-sdk";
import { useTopbarPortalTargets } from "@decocms/mesh-sdk/plugins";
import { SidebarTrigger } from "@deco/ui/components/sidebar.tsx";

/**
 * Project-aware topbar component
 *
 * Always renders a sidebar toggle. For regular projects, also includes
 * portal target slots for left, center, and right content.
 *
 * Content is rendered into these slots via <TopbarPortal side="left|center|right">
 * from anywhere in the component tree (including plugin routes).
 * Portal-based rendering preserves the source tree's React context,
 * so plugin context (connection, toolCaller, etc.) works naturally.
 */
export function ProjectTopbar() {
  const { locator } = useProjectContext();
  const portalTargets = useTopbarPortalTargets();
  const isOrgAdmin = Locator.isOrgAdminProject(locator);

  if (isOrgAdmin) return null;

  return (
    <header className="sticky top-0 z-50 h-11 bg-background flex items-center px-2 shrink-0 border-b border-border/40">
      {/* Sidebar toggle */}
      <SidebarTrigger className="text-muted-foreground" />

      {/* Left Section - portal target (breadcrumbs etc.) */}
      <div
        ref={portalTargets?.leftRef}
        className="flex items-center gap-2 flex-1 min-w-0"
      />

      {/* Center Section - portal target, hidden when empty */}
      <div
        ref={portalTargets?.centerRef}
        className="flex flex-1 h-full items-center justify-center px-4 min-w-0 [&:empty]:hidden"
      />

      {/* Right Section - portal target, hidden when empty */}
      <div
        ref={portalTargets?.rightRef}
        className="flex flex-1 gap-2 h-full items-center justify-end min-w-0 [&:empty]:hidden"
      />
    </header>
  );
}

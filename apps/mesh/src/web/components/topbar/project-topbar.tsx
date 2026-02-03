import { Locator, useProjectContext } from "@decocms/mesh-sdk";
import { useRouterState } from "@tanstack/react-router";
import { Home02 } from "@untitledui/icons";
import type { ReactNode } from "react";

interface ProjectTopbarProps {
  /** Content for the center section (e.g., search bar) */
  center?: ReactNode;
  /** Content for the right section (e.g., action buttons, user menu) */
  right?: ReactNode;
}

/**
 * Project-aware topbar component
 *
 * - For org-admin: Not shown (handled by shell layout)
 * - For regular projects: Dark background with breadcrumb and actions
 *   (project switcher is in the sidebar header)
 */
export function ProjectTopbar({ center, right }: ProjectTopbarProps) {
  const { org, project, locator } = useProjectContext();
  const routerState = useRouterState();
  const isOrgAdmin = Locator.isOrgAdminProject(locator);

  // Get current page name from route (simplified - just show "Home" for now)
  const currentPath = routerState.location.pathname;
  const isHomePage =
    currentPath === `/${org.slug}/${project.slug}` ||
    currentPath === `/${org.slug}/${project.slug}/`;

  // This component should only render for non-org-admin projects
  if (isOrgAdmin) return null;

  return (
    <header className="h-[47px] bg-[#030302] flex items-center px-4 shrink-0">
      {/* Left Section - Breadcrumb */}
      <div className="flex items-center gap-2 flex-1">
        <Home02 className="size-4 text-white" />
        <span className="text-sm text-white">
          {isHomePage ? "Home" : "Home"}
        </span>
      </div>

      {/* Center Section */}
      {center && (
        <div className="flex flex-1 h-full items-center justify-center px-4">
          {center}
        </div>
      )}

      {/* Right Section */}
      {right && (
        <div className="flex flex-1 gap-2 h-full items-center justify-end">
          {right}
        </div>
      )}
    </header>
  );
}

// Compound components for flexibility
ProjectTopbar.Left = function Left({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
};

ProjectTopbar.Center = function Center({ children }: { children: ReactNode }) {
  return <div className="flex-1 flex justify-center">{children}</div>;
};

ProjectTopbar.Right = function Right({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
};

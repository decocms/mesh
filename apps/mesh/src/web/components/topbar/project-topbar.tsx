import { Locator, useProjectContext } from "@decocms/mesh-sdk";
import type { ReactNode } from "react";

interface ProjectTopbarProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}

/**
 * Project-aware topbar component
 *
 * - For org-admin: Not shown (handled by shell layout)
 * - For regular projects: Dark background with breadcrumb and actions
 *   (project switcher is in the sidebar header)
 */
export function ProjectTopbar({ left, center, right }: ProjectTopbarProps) {
  const { locator } = useProjectContext();
  const isOrgAdmin = Locator.isOrgAdminProject(locator);

  if (isOrgAdmin) return null;

  return (
    <div className="dark">
      <header className="sticky top-0 z-50 h-12 bg-background flex items-center px-4 shrink-0">
        {/* Left Section - Breadcrumb */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {left}
        </div>

        {/* Center Section */}
        {center && (
          <div className="flex flex-1 h-full items-center justify-center px-4 min-w-0">
            {center}
          </div>
        )}

        {/* Right Section */}
        {right && (
          <div className="flex flex-1 gap-2 h-full items-center justify-end min-w-0">
            {right}
          </div>
        )}
      </header>
    </div>
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

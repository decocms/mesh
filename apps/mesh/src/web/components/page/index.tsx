import { cn } from "@deco/ui/lib/utils.ts";
import { ORG_ADMIN_PROJECT_SLUG, useProjectContext } from "@decocms/mesh-sdk";
import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";

/**
 * Hook to safely check if we're in a project context (not org-admin).
 * Returns true if we're in a regular project context (should use dark mode).
 * Returns false if we're in org-admin or no context available.
 */
function useIsProjectMode(): boolean {
  try {
    const { project } = useProjectContext();
    return !project.isOrgAdmin && project.slug !== ORG_ADMIN_PROJECT_SLUG;
  } catch {
    return false;
  }
}

// Helper to find child by type for slot-based composition
function findChild<T>(
  children: ReactNode,
  type: (props: T) => ReactNode,
): ReactElement<T> | null {
  const arr = Children.toArray(children);
  for (const child of arr) {
    if (isValidElement(child) && child.type === type) {
      return child as ReactElement<T>;
    }
  }
  return null;
}

// Root page container
function PageRoot({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Page header with slot-based composition
// Automatically applies dark mode when in project context (not org-admin)
function PageHeader({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const left = findChild(children, PageHeaderLeft);
  const right = findChild(children, PageHeaderRight);
  const isProjectMode = useIsProjectMode();

  return (
    <div className={cn(isProjectMode && "dark")}>
      <div
        className={cn(
          "shrink-0 w-full bg-background border-b border-border h-12 overflow-x-auto",
          "flex items-center justify-between gap-3 px-4 min-w-max",
          className,
        )}
      >
        {left}
        {right}
      </div>
    </div>
  );
}

// Left slot for title, breadcrumbs, etc.
function PageHeaderLeft({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 flex-shrink-0 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Right slot for actions, buttons, filters
function PageHeaderRight({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 flex-shrink-0 overflow-hidden border-l border-border pl-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Content area with proper overflow handling
function PageContent({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("flex-1 overflow-auto", className)}>{children}</div>
  );
}

// Export with composition pattern
export const Page = Object.assign(PageRoot, {
  Header: Object.assign(PageHeader, {
    Left: PageHeaderLeft,
    Right: PageHeaderRight,
  }),
  Content: PageContent,
});

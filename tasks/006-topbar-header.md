# Task 006: Topbar and Header Updates

## Overview

Update the topbar to be project-aware with a dark variant for non-org-admin projects, and add a project switcher dropdown to the sidebar header.

## Prerequisites

- **Task 003** (Routing Refactor) - New route structure must be in place
- **Task 004** (Project Layout and Context) - ProjectContext must be available
- **Task 005** (Sidebar Groups) - Sidebar structure should be updated

## Context

### Design Requirements

**Org-Admin Project:**
- Default/light topbar
- Standard navigation

**Regular Projects:**
- Dark/black topbar background
- Back arrow to return to org-admin
- Project name in breadcrumb
- Plugin-specific actions on the right (future enhancement)

### Sidebar Header
- Shows org name (smaller) + project name (larger)
- Clicking opens project switcher dropdown
- Dropdown shows: "Back to Organization", list of projects, "New Project"

## Implementation Steps

### Step 1: Create Topbar Variants

Update or create topbar component at `apps/mesh/src/web/components/topbar/app-topbar.tsx`:

```typescript
import { cn } from "@/web/lib/utils";
import { ArrowLeft, Search } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import type { ReactNode } from "react";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

interface AppTopbarProps {
  children?: ReactNode;
}

export function AppTopbar({ children }: AppTopbarProps) {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  return (
    <header
      className={cn(
        "h-14 border-b flex items-center px-4 gap-4",
        isOrgAdmin
          ? "bg-background border-border"
          : "bg-zinc-900 border-zinc-800 text-white"
      )}
    >
      {/* Left Section */}
      <div className="flex items-center gap-3">
        {!isOrgAdmin && (
          <>
            {/* Back Button */}
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/$org/$project",
                  params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
                })
              }
              className={cn(
                "size-8 flex items-center justify-center rounded-lg transition-colors",
                "hover:bg-zinc-800"
              )}
              aria-label="Back to organization"
            >
              <ArrowLeft className="size-4" />
            </button>

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm">
              <Link
                to="/$org/$project"
                params={{ org: org.slug, project: ORG_ADMIN_PROJECT_SLUG }}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                {org.name}
              </Link>
              <span className="text-zinc-600">/</span>
              <span className="font-medium">{project.name}</span>
            </nav>
          </>
        )}
      </div>

      {/* Center Section - Command Search */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
            isOrgAdmin
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          )}
        >
          <Search className="size-4" />
          <span>Search...</span>
          <kbd className="text-xs opacity-60">⌘K</kbd>
        </button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Plugin-specific actions slot */}
        {children}
        
        {/* User Menu - import from existing component */}
        {/* <UserMenu variant={isOrgAdmin ? "default" : "dark"} /> */}
      </div>
    </header>
  );
}

// Compound components for flexibility
AppTopbar.Left = function Left({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3">{children}</div>;
};

AppTopbar.Center = function Center({ children }: { children: ReactNode }) {
  return <div className="flex-1 flex justify-center">{children}</div>;
};

AppTopbar.Right = function Right({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
};
```

### Step 2: Create Project Switcher Component

Create `apps/mesh/src/web/components/sidebar/project-switcher.tsx`:

```typescript
import { useState } from "react";
import { ChevronDown, Plus, ArrowLeft, Check } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { useProjects } from "@/web/hooks/use-project";
import { cn } from "@/web/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu"; // Adjust import

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

interface ProjectSwitcherProps {
  onCreateProject?: () => void;
}

export function ProjectSwitcher({ onCreateProject }: ProjectSwitcherProps) {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const { data: projects } = useProjects(org.id);
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  // Filter out org-admin from project list (it's shown separately)
  const userProjects = projects?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG) ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors w-full text-left"
        >
          {/* Project Icon */}
          {project.ui?.icon ? (
            <img
              src={project.ui.icon}
              alt=""
              className="size-8 rounded-lg object-cover"
            />
          ) : (
            <div
              className="size-8 rounded-lg flex items-center justify-center text-sm font-medium text-white"
              style={{ backgroundColor: project.ui?.themeColor ?? "#3B82F6" }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Names */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{org.name}</p>
            <p className="text-sm font-medium truncate">{project.name}</p>
          </div>

          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        {/* Back to Organization */}
        {!isOrgAdmin && (
          <>
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: "/$org/$project",
                  params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
                })
              }
            >
              <ArrowLeft className="size-4 mr-2" />
              Back to Organization
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Organization Admin */}
        <DropdownMenuItem
          onClick={() =>
            navigate({
              to: "/$org/$project",
              params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
            })
          }
          className={cn(isOrgAdmin && "bg-muted")}
        >
          <div className="size-6 rounded bg-zinc-900 flex items-center justify-center mr-2">
            <span className="text-xs text-white font-medium">O</span>
          </div>
          <span className="flex-1">Organization Admin</span>
          {isOrgAdmin && <Check className="size-4" />}
        </DropdownMenuItem>

        {/* User Projects */}
        {userProjects.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <p className="text-xs text-muted-foreground font-medium">Projects</p>
            </div>
            {userProjects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() =>
                  navigate({
                    to: "/$org/$project",
                    params: { org: org.slug, project: p.slug },
                  })
                }
                className={cn(p.id === project.id && "bg-muted")}
              >
                {p.ui?.icon ? (
                  <img
                    src={p.ui.icon}
                    alt=""
                    className="size-6 rounded mr-2 object-cover"
                  />
                ) : (
                  <div
                    className="size-6 rounded flex items-center justify-center mr-2 text-xs font-medium text-white"
                    style={{ backgroundColor: p.ui?.themeColor ?? "#3B82F6" }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="flex-1 truncate">{p.name}</span>
                {p.id === project.id && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* Create New Project */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateProject}>
          <Plus className="size-4 mr-2" />
          New Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Step 3: Create Sidebar Header Component

Create `apps/mesh/src/web/components/sidebar/sidebar-header.tsx`:

```typescript
import { ProjectSwitcher } from "./project-switcher";

interface SidebarHeaderProps {
  onCreateProject?: () => void;
}

export function SidebarHeader({ onCreateProject }: SidebarHeaderProps) {
  return (
    <div className="p-2 border-b">
      <ProjectSwitcher onCreateProject={onCreateProject} />
    </div>
  );
}
```

### Step 4: Update Project Sidebar

Update `apps/mesh/src/web/components/sidebar/project-sidebar.tsx` to include the header:

```typescript
import { SidebarHeader } from "./sidebar-header";
// ... other imports

export function ProjectSidebar() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // ... existing code

  return (
    <div className="flex flex-col h-full">
      {/* Header with Project Switcher */}
      <SidebarHeader onCreateProject={() => setCreateDialogOpen(true)} />
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* ... existing navigation items */}
      </div>
      
      {/* Create Project Dialog - to be implemented in Task 009 */}
      {/* <CreateProjectDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} /> */}
    </div>
  );
}
```

### Step 5: Update Shell Layout

Update `apps/mesh/src/web/layouts/shell-layout.tsx` to use the new topbar:

```typescript
import { Outlet } from "@tanstack/react-router";
import { AppTopbar } from "@/web/components/topbar/app-topbar";
import { ProjectSidebar } from "@/web/components/sidebar/project-sidebar";

export default function ShellLayout() {
  return (
    <div className="h-screen flex flex-col">
      {/* Topbar */}
      <AppTopbar />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r flex flex-col overflow-hidden">
          <ProjectSidebar />
        </aside>
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

### Step 6: Handle Dark Mode Compatibility

If the app supports dark mode, ensure the topbar variants work correctly:

```typescript
// In topbar component
const isDarkMode = useIsDarkMode(); // Your dark mode hook

// Adjust colors for dark mode compatibility
className={cn(
  "h-14 border-b flex items-center px-4 gap-4",
  isOrgAdmin
    ? "bg-background border-border"
    : isDarkMode
      ? "bg-zinc-950 border-zinc-900"
      : "bg-zinc-900 border-zinc-800",
  !isOrgAdmin && "text-white"
)}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/components/topbar/app-topbar.tsx` | Create or modify |
| `apps/mesh/src/web/components/sidebar/project-switcher.tsx` | Create |
| `apps/mesh/src/web/components/sidebar/sidebar-header.tsx` | Create |
| `apps/mesh/src/web/components/sidebar/project-sidebar.tsx` | Modify |
| `apps/mesh/src/web/layouts/shell-layout.tsx` | Modify |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Visual Verification - Org Admin

Start the dev server and navigate to `/$org/org-admin`:

1. Topbar should have light/default background
2. No back button should appear
3. Sidebar header should show project switcher
4. Clicking switcher should show dropdown

### 3. Visual Verification - Regular Project

Navigate to a regular project (or create test route):

1. Topbar should have dark background
2. Back button should appear on left
3. Breadcrumb should show: "Org Name / Project Name"
4. Clicking back should go to org-admin

### 4. Test Project Switcher

1. Open project switcher dropdown
2. Should show "Organization Admin" option
3. Should show list of other projects
4. Should show "New Project" option
5. Clicking a project should navigate to it
6. Current project should have checkmark

### 5. Run Lint and Format

```bash
bun run fmt
bun run lint
```

No errors should be present.

### 6. Run Tests

```bash
bun test
```

All tests should pass.

## Success Criteria

- [ ] Topbar has dark variant for non-org-admin projects
- [ ] Back button navigates to org-admin
- [ ] Breadcrumb shows org/project hierarchy
- [ ] Project switcher dropdown works
- [ ] Switcher shows all projects
- [ ] Current project is highlighted
- [ ] "New Project" option exists (functionality in later task)
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- Dropdown component may need to be imported from UI library (shadcn, radix, etc.)
- Adjust styling to match existing design system
- The "New Project" functionality will be implemented in Task 009
- User menu component should be integrated from existing code

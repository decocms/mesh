# Task 007: Projects List Page

## Overview

Create the projects list page that displays all projects in the organization as a card grid. This page is only accessible from the org-admin project.

## Prerequisites

- **Task 001** (Database Schema and Storage) - Projects data must exist
- **Task 002** (MCP Tools) - PROJECT_LIST tool must work
- **Task 003** (Routing Refactor) - `/projects` route under org-admin
- **Task 004** (Project Layout and Context) - Context must be available
- **Task 005** (Sidebar Groups) - "Projects" item in org-admin sidebar

## Context

### Figma Reference
- **Projects list (cards):** [https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=5-25974](https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=5-25974)

### Page Structure
- Header with breadcrumb and "Create new project" button
- Search input
- Card grid with:
  - "Create new project" placeholder card
  - Project cards showing: banner, icon, name, last updated, enabled plugins, org badge

## Implementation Steps

### Step 1: Create Project Card Component

Create `apps/mesh/src/web/components/project-card.tsx`:

```typescript
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { cn } from "@/web/lib/utils";
import { formatDistanceToNow } from "date-fns"; // Or your date library

interface ProjectUI {
  banner: string | null;
  bannerColor: string | null;
  icon: string | null;
  themeColor: string | null;
}

interface ProjectCardProps {
  project: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    enabledPlugins: string[] | null;
    ui: ProjectUI | null;
    updatedAt: string;
  };
  onSettingsClick?: (e: React.MouseEvent) => void;
}

export function ProjectCard({ project, onSettingsClick }: ProjectCardProps) {
  const { org } = useProjectContext();

  const bannerStyle = {
    backgroundColor: project.ui?.bannerColor ?? "#3B82F6",
    backgroundImage: project.ui?.banner ? `url(${project.ui.banner})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  return (
    <Link
      to="/$org/$project"
      params={{ org: org.slug, project: project.slug }}
      className="block group"
    >
      <div className="border rounded-xl overflow-hidden bg-card hover:shadow-lg transition-shadow">
        {/* Banner */}
        <div className="h-24 relative" style={bannerStyle}>
          {/* Settings Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSettingsClick?.(e);
            }}
            className={cn(
              "absolute top-2 right-2 size-8 rounded-lg flex items-center justify-center",
              "bg-black/20 hover:bg-black/40 transition-colors",
              "opacity-0 group-hover:opacity-100"
            )}
          >
            <Settings className="size-4 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Project Icon */}
          <div className="-mt-10 mb-3">
            {project.ui?.icon ? (
              <img
                src={project.ui.icon}
                alt=""
                className="size-12 rounded-xl border-2 border-background object-cover"
              />
            ) : (
              <div
                className="size-12 rounded-xl border-2 border-background flex items-center justify-center text-lg font-semibold text-white"
                style={{ backgroundColor: project.ui?.themeColor ?? "#3B82F6" }}
              >
                {project.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name */}
          <h3 className="font-semibold text-foreground truncate">
            {project.name}
          </h3>

          {/* Updated Time */}
          <p className="text-sm text-muted-foreground mt-0.5">
            Edited {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4">
            {/* Plugin Icons */}
            <div className="flex -space-x-1.5">
              {project.enabledPlugins?.slice(0, 4).map((pluginId) => (
                <PluginIcon key={pluginId} pluginId={pluginId} />
              ))}
              {(project.enabledPlugins?.length ?? 0) > 4 && (
                <div className="size-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs text-muted-foreground">
                  +{project.enabledPlugins!.length - 4}
                </div>
              )}
            </div>

            {/* Org Badge */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              <div className="size-3 rounded-full bg-primary/20" />
              <span className="truncate max-w-20">{org.name}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Plugin icon component - adjust based on your plugin system
function PluginIcon({ pluginId }: { pluginId: string }) {
  // You may have a mapping of plugin IDs to icons
  // For now, show a generic icon
  return (
    <div className="size-6 rounded-full bg-zinc-800 border-2 border-background flex items-center justify-center">
      <span className="text-[10px] text-white font-medium">
        {pluginId.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
```

### Step 2: Create New Project Card Component

Create `apps/mesh/src/web/components/create-project-card.tsx`:

```typescript
import { Plus } from "lucide-react";

interface CreateProjectCardProps {
  onClick: () => void;
}

export function CreateProjectCard({ onClick }: CreateProjectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-2 border-dashed rounded-xl h-full min-h-[240px] flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
    >
      <div className="size-12 rounded-full bg-muted flex items-center justify-center">
        <Plus className="size-6" />
      </div>
      <div className="text-center">
        <p className="font-medium">Create</p>
        <p className="text-sm">new project</p>
      </div>
    </button>
  );
}
```

### Step 3: Create Projects List Page

Update `apps/mesh/src/web/routes/projects-list.tsx`:

```typescript
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { useProjects } from "@/web/hooks/use-project";
import { ProjectCard } from "@/web/components/project-card";
import { CreateProjectCard } from "@/web/components/create-project-card";
import { Input } from "@/web/components/ui/input";
import { Button } from "@/web/components/ui/button";
// CreateProjectDialog will be implemented in Task 009
// import { CreateProjectDialog } from "@/web/components/create-project-dialog";

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

export default function ProjectsListPage() {
  const { org } = useProjectContext();
  const { data: projects, isLoading } = useProjects(org.id);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Filter out org-admin and apply search
  const userProjects = projects
    ?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG)
    ?.filter((p) => 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
    ) ?? [];

  const handleSettingsClick = (projectId: string) => {
    // Navigate to project settings
    // Or open settings dialog
    console.log("Settings for project:", projectId);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{org.name}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
          <span className="font-medium">Projects</span>
        </nav>

        {/* Create Button */}
        <Button onClick={() => setCreateDialogOpen(true)}>
          Create new project
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search for a project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-[240px] rounded-xl bg-muted animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Card Grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Create New Project Card */}
          <CreateProjectCard onClick={() => setCreateDialogOpen(true)} />

          {/* Project Cards */}
          {userProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSettingsClick={() => handleSettingsClick(project.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && userProjects.length === 0 && search && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No projects found matching "{search}"</p>
        </div>
      )}

      {/* Create Project Dialog - Placeholder until Task 009 */}
      {/* <CreateProjectDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      /> */}
    </div>
  );
}
```

### Step 4: Add CSS for Card Animations (Optional)

If not already present, add hover animations in your CSS:

```css
/* In your global CSS or component styles */
.group:hover .group-hover\:opacity-100 {
  opacity: 1;
}
```

### Step 5: Verify Route Registration

Ensure the route is registered in `apps/mesh/src/web/index.tsx`:

```typescript
const projectsListRoute = createRoute({
  getParentRoute: () => projectLayout,
  path: "/projects",
  beforeLoad: orgAdminGuard, // Only accessible in org-admin
  component: lazyRouteComponent(() => import("./routes/projects-list.tsx")),
});
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/components/project-card.tsx` | Create |
| `apps/mesh/src/web/components/create-project-card.tsx` | Create |
| `apps/mesh/src/web/routes/projects-list.tsx` | Update (replace placeholder) |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Visual Verification

Start the dev server:
```bash
bun run dev
```

Navigate to `/$org/org-admin/projects`:

1. Should see breadcrumb: "Org Name / Projects"
2. Should see "Create new project" button in header
3. Should see search input
4. Should see "Create new project" card (dashed border)
5. Should see project cards for any existing projects

### 3. Test Search

1. Type in search box
2. Cards should filter based on name/description
3. Empty state should show when no matches

### 4. Test Card Interactions

1. Hover over project card - settings button should appear
2. Click settings button - should not navigate (just log for now)
3. Click card - should navigate to project

### 5. Test Responsive Layout

1. Resize browser
2. Cards should reflow: 4 cols → 3 cols → 2 cols → 1 col

### 6. Run Lint and Format

```bash
bun run fmt
bun run lint
```

No errors should be present.

### 7. Run Tests

```bash
bun test
```

All tests should pass.

## Success Criteria

- [ ] Projects list page displays card grid
- [ ] "Create new project" card is first in grid
- [ ] Project cards show: banner, icon, name, updated time, plugins
- [ ] Search filters projects correctly
- [ ] Empty state shows for no search results
- [ ] Loading state shows skeleton cards
- [ ] Settings button appears on hover
- [ ] Clicking card navigates to project
- [ ] Responsive grid layout works
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- Plugin icons may need a proper mapping - implement based on your plugin system
- The CreateProjectDialog is a placeholder - will be implemented in Task 009
- Settings click handler is a stub - can link to project settings or open dialog
- Adjust date formatting based on your preferred library

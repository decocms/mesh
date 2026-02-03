# Task 005: Sidebar Groups and Project-Aware Navigation

## Overview

Refactor the sidebar to support grouped items with collapsible sections, and make it project-aware. The sidebar should show different items based on whether the user is in `org-admin` or a regular project.

## Prerequisites

- **Task 003** (Routing Refactor) - New route structure must be in place
- **Task 004** (Project Layout and Context) - ProjectContext must be available

## Context

### Figma Reference
- **Sidebar design:** [https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=7-21541](https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=7-21541)

### Sidebar Structure

**All Projects:**
- Home
- Connections (if available in project)
- Tasks
- Agents (if available in project)
- [Divider]
- [Plugin Groups] - Dynamic based on enabled plugins
- [Divider]
- Settings (at bottom)

**Org-Admin Only (additional):**
- [Organization Group]
  - Projects
  - Store
  - Workflows
  - Monitoring
  - Members

## Implementation Steps

### Step 1: Update Sidebar Types

Update or create `apps/mesh/src/web/components/sidebar/types.ts`:

```typescript
import type { ReactNode } from "react";

export interface SidebarItemGroup {
  id: string;
  label: string;
  items: SidebarItem[];
  defaultExpanded?: boolean;
}

export interface SidebarItem {
  key: string;
  label: string;
  icon: ReactNode;
  to?: string;
  params?: Record<string, string>;
  onClick?: () => void;
  badge?: string | number;
  isActive?: boolean;
}

export interface SidebarSection {
  type: "items" | "group" | "divider";
  items?: SidebarItem[];
  group?: SidebarItemGroup;
}
```

### Step 2: Create Collapsible Group Component

Create `apps/mesh/src/web/components/sidebar/sidebar-group.tsx`:

```typescript
import { useState } from "react";
import { ChevronDown } from "lucide-react"; // Or your icon library
import { cn } from "@/web/lib/utils";
import type { ReactNode } from "react";

interface SidebarGroupProps {
  label: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function SidebarGroup({ 
  label, 
  children, 
  defaultExpanded = true 
}: SidebarGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-2 py-1.5 h-7 rounded-lg hover:bg-muted/50 transition-colors"
      >
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <ChevronDown 
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            !expanded && "-rotate-90"
          )} 
        />
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
```

### Step 3: Update Sidebar Item Component

Update `apps/mesh/src/web/components/sidebar/sidebar-item.tsx` (or create if doesn't exist):

```typescript
import { Link, useMatchRoute } from "@tanstack/react-router";
import { cn } from "@/web/lib/utils";
import type { ReactNode } from "react";

interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  to?: string;
  params?: Record<string, string>;
  onClick?: () => void;
  badge?: string | number;
  className?: string;
}

export function SidebarItem({
  icon,
  label,
  to,
  params,
  onClick,
  badge,
  className,
}: SidebarItemProps) {
  const matchRoute = useMatchRoute();
  const isActive = to ? matchRoute({ to, params, fuzzy: true }) : false;

  const content = (
    <>
      <span className="size-5 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && (
        <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </>
  );

  const baseClasses = cn(
    "flex items-center gap-2 px-2 py-1.5 h-8 rounded-lg text-sm transition-colors",
    isActive
      ? "bg-primary/10 text-primary font-medium"
      : "text-foreground/80 hover:bg-muted/50 hover:text-foreground",
    className
  );

  if (to) {
    return (
      <Link to={to} params={params} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={baseClasses}>
      {content}
    </button>
  );
}
```

### Step 4: Create Project Sidebar Component

Create `apps/mesh/src/web/components/sidebar/project-sidebar.tsx`:

```typescript
import {
  Home,
  Container,
  Target,
  Glasses,
  FolderKanban,
  Building,
  Zap,
  BarChart3,
  Users,
  Settings,
} from "lucide-react"; // Or your icon library
import { useProjectContext } from "@decocms/mesh-sdk/context/project-context";
import { SidebarItem } from "./sidebar-item";
import { SidebarGroup } from "./sidebar-group";
import { pluginRootSidebarItems } from "@/web/index"; // Import from router

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

export function ProjectSidebar() {
  const { org, project } = useProjectContext();
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  // Filter plugins to only show enabled ones
  const enabledPluginItems = pluginRootSidebarItems.filter(
    (item) => project.enabledPlugins?.includes(item.pluginId) ?? false
  );

  // Group plugins by their group property (if any)
  const pluginGroups = groupPluginsByGroup(enabledPluginItems);

  return (
    <div className="flex flex-col h-full p-2 gap-1">
      {/* Main Navigation */}
      <div className="flex flex-col gap-0.5">
        <SidebarItem
          icon={<Home className="size-4" />}
          label="Home"
          to="/$org/$project"
          params={{ org: org.slug, project: project.slug }}
        />
        
        {/* Connections - show in org-admin, or if project has connections access */}
        {isOrgAdmin && (
          <SidebarItem
            icon={<Container className="size-4" />}
            label="Connections"
            to="/$org/$project/mcps"
            params={{ org: org.slug, project: project.slug }}
          />
        )}
        
        <SidebarItem
          icon={<Target className="size-4" />}
          label="Tasks"
          to="/$org/$project/tasks"
          params={{ org: org.slug, project: project.slug }}
        />
        
        {isOrgAdmin && (
          <SidebarItem
            icon={<Glasses className="size-4" />}
            label="Agents"
            to="/$org/$project/agents"
            params={{ org: org.slug, project: project.slug }}
          />
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border my-2" />

      {/* Organization Group - Only in org-admin */}
      {isOrgAdmin && (
        <>
          <SidebarGroup label="Organization">
            <SidebarItem
              icon={<FolderKanban className="size-4" />}
              label="Projects"
              to="/$org/$project/projects"
              params={{ org: org.slug, project: project.slug }}
            />
            <SidebarItem
              icon={<Building className="size-4" />}
              label="Store"
              to="/$org/$project/store"
              params={{ org: org.slug, project: project.slug }}
            />
            <SidebarItem
              icon={<Zap className="size-4" />}
              label="Workflows"
              to="/$org/$project/workflows"
              params={{ org: org.slug, project: project.slug }}
            />
            <SidebarItem
              icon={<BarChart3 className="size-4" />}
              label="Monitoring"
              to="/$org/$project/monitoring"
              params={{ org: org.slug, project: project.slug }}
            />
            <SidebarItem
              icon={<Users className="size-4" />}
              label="Members"
              to="/$org/$project/members"
              params={{ org: org.slug, project: project.slug }}
            />
          </SidebarGroup>
          <div className="h-px bg-border my-2" />
        </>
      )}

      {/* Plugin Groups */}
      {pluginGroups.map((group) => (
        <div key={group.id}>
          {group.label ? (
            <SidebarGroup label={group.label}>
              {group.items.map((item) => (
                <SidebarItem
                  key={item.pluginId}
                  icon={item.icon}
                  label={item.label}
                  to="/$org/$project/$pluginId"
                  params={{ 
                    org: org.slug, 
                    project: project.slug,
                    pluginId: item.pluginId,
                  }}
                />
              ))}
            </SidebarGroup>
          ) : (
            group.items.map((item) => (
              <SidebarItem
                key={item.pluginId}
                icon={item.icon}
                label={item.label}
                to="/$org/$project/$pluginId"
                params={{ 
                  org: org.slug, 
                  project: project.slug,
                  pluginId: item.pluginId,
                }}
              />
            ))
          )}
          <div className="h-px bg-border my-2" />
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex flex-col gap-0.5">
        <SidebarItem
          icon={<Settings className="size-4" />}
          label="Settings"
          to="/$org/$project/settings"
          params={{ org: org.slug, project: project.slug }}
        />
      </div>
    </div>
  );
}

// Helper to group plugins
function groupPluginsByGroup(items: typeof pluginRootSidebarItems) {
  const groups: Map<string, typeof items> = new Map();
  const ungrouped: typeof items = [];

  for (const item of items) {
    const groupName = (item as any).group; // Group may be added later
    if (groupName) {
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(item);
    } else {
      ungrouped.push(item);
    }
  }

  const result: { id: string; label: string | null; items: typeof items }[] = [];

  // Add ungrouped first
  if (ungrouped.length > 0) {
    result.push({ id: "ungrouped", label: null, items: ungrouped });
  }

  // Add grouped
  for (const [label, groupItems] of groups) {
    result.push({ id: label, label, items: groupItems });
  }

  return result;
}
```

### Step 5: Update Plugin Registration (Optional Enhancement)

If you want plugins to support groups, update `packages/bindings/src/core/plugins.ts`:

```typescript
interface PluginSetupContext {
  registerRootSidebarItem(item: {
    icon: ReactNode;
    label: string;
    group?: string; // NEW: Optional group name
  }): void;
  // ... other methods
}
```

### Step 6: Integrate New Sidebar

Update the shell layout or wherever the sidebar is rendered to use `ProjectSidebar`:

```typescript
// In apps/mesh/src/web/layouts/shell-layout.tsx or similar
import { ProjectSidebar } from "@/web/components/sidebar/project-sidebar";

// Replace existing sidebar with ProjectSidebar
<aside className="w-64 border-r h-full">
  <ProjectSidebar />
</aside>
```

### Step 7: Update Existing Sidebar References

Search for and update any other sidebar components or imports:
- Remove or deprecate old sidebar components
- Update any components that directly manipulate sidebar state

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/components/sidebar/types.ts` | Create or modify |
| `apps/mesh/src/web/components/sidebar/sidebar-group.tsx` | Create |
| `apps/mesh/src/web/components/sidebar/sidebar-item.tsx` | Create or modify |
| `apps/mesh/src/web/components/sidebar/project-sidebar.tsx` | Create |
| `apps/mesh/src/web/layouts/shell-layout.tsx` | Modify (use new sidebar) |
| `packages/bindings/src/core/plugins.ts` | Optional modify (add group) |

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

Test these scenarios:

**In org-admin project:**
1. Should see: Home, Connections, Tasks, Agents
2. Should see Organization group with: Projects, Store, Workflows, Monitoring, Members
3. Should see Settings at bottom

**In regular project (if any exist):**
1. Should see: Home, Tasks
2. Should NOT see Organization group
3. Should see Settings at bottom

### 3. Test Collapsible Groups

1. Click on "Organization" group header
2. Group should collapse/expand
3. Collapsed state should hide child items

### 4. Test Active States

1. Navigate to different pages
2. Active sidebar item should be highlighted
3. Active state should match current route

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

- [ ] SidebarGroup component created with collapse functionality
- [ ] SidebarItem component with active state detection
- [ ] ProjectSidebar shows correct items based on project type
- [ ] Organization group only shows in org-admin
- [ ] Plugin items filtered by enabled plugins
- [ ] Settings at bottom of sidebar
- [ ] Proper navigation with new route structure
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- Icon library may differ - adjust imports as needed
- Plugin filtering requires `enabledPlugins` from project context
- Group support for plugins is optional for this task
- Match existing styling patterns in the codebase

# Task 004: Project Layout and Context

## Overview

Enhance the project layout component to fetch project data from storage and provide it via React context. This enables all child components to access project information.

## Prerequisites

- **Task 001** (Database Schema and Storage) - Project storage must exist
- **Task 003** (Routing Refactor) - Project layout route must be in place

## Context

The project layout wraps all project-scoped routes. It:
1. Fetches project data based on URL params (`$org`, `$project`)
2. Validates the project exists
3. Provides project data via React context
4. Handles loading and error states

## Implementation Steps

### Step 1: Add Query Keys

Update `apps/mesh/src/web/lib/query-keys.ts` by adding to the existing `KEYS` object:

```typescript
export const KEYS = {
  // ... existing keys ...

  // Projects (scoped by organization)
  projects: (organizationId: string) => ["projects", organizationId] as const,
  project: (organizationId: string, slug: string) =>
    ["project", organizationId, slug] as const,
  projectById: (projectId: string) => ["project", "byId", projectId] as const,

  // Project plugin configs
  projectPluginConfigs: (projectId: string) =>
    ["project-plugin-configs", projectId] as const,
  projectPluginConfig: (projectId: string, pluginId: string) =>
    ["project-plugin-config", projectId, pluginId] as const,
} as const;
```

### Step 2: Create Project Hooks

Create `apps/mesh/src/web/hooks/use-project.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
// Import your MCP client or API client
import { client } from "../lib/client"; // Adjust import

export function useProject(organizationId: string, slug: string) {
  return useQuery({
    queryKey: KEYS.project(organizationId, slug),
    queryFn: async () => {
      const result = await client.call("PROJECT_GET", {
        organizationId,
        slug,
      });
      return result.project;
    },
    enabled: !!organizationId && !!slug,
  });
}

export function useProjects(organizationId: string) {
  return useQuery({
    queryKey: KEYS.projects(organizationId),
    queryFn: async () => {
      const result = await client.call("PROJECT_LIST", {
        organizationId,
      });
      return result.projects;
    },
    enabled: !!organizationId,
  });
}
```

### Step 3: Update ProjectContext

Find where ProjectContext is defined (likely `packages/mesh-sdk/src/context/project-context.tsx` or similar) and update it:

```typescript
import { createContext, useContext, type ReactNode } from "react";

export interface ProjectUI {
  banner: string | null;
  bannerColor: string | null;
  icon: string | null;
  themeColor: string | null;
}

export interface ProjectData {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  enabledPlugins: string[] | null;
  ui: ProjectUI | null;
  isOrgAdmin: boolean;
}

export interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export interface ProjectContextValue {
  org: OrganizationData;
  project: ProjectData;
  // Keep existing locator if used elsewhere
  locator?: {
    organizationId: string;
    projectSlug: string;
  };
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ProjectContextValue;
}) {
  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProjectContext must be used within ProjectContextProvider");
  }
  return context;
}

// Convenience hooks
export function useOrg() {
  return useProjectContext().org;
}

export function useCurrentProject() {
  return useProjectContext().project;
}

export function useIsOrgAdmin() {
  return useProjectContext().project.isOrgAdmin;
}
```

### Step 4: Update Project Layout

Update `apps/mesh/src/web/layouts/project-layout.tsx`:

```typescript
import { Outlet, useParams, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { SplashScreen } from "@/web/components/splash-screen";
import { useProject } from "@/web/hooks/use-project";
import { ProjectContextProvider } from "@decocms/mesh-sdk/context/project-context"; // Adjust import
import { useOrganization } from "@/web/hooks/use-organization"; // Existing hook

const ORG_ADMIN_PROJECT_SLUG = "org-admin";

export default function ProjectLayout() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const orgSlug = params.org as string;
  const projectSlug = params.project as string;

  // Fetch organization data (use existing hook/pattern)
  const { data: org, isLoading: orgLoading, error: orgError } = useOrganization(orgSlug);

  // Fetch project data
  const { 
    data: project, 
    isLoading: projectLoading, 
    error: projectError 
  } = useProject(org?.id ?? "", projectSlug);

  // Loading state
  if (orgLoading || projectLoading) {
    return <SplashScreen />;
  }

  // Error handling - org not found
  if (orgError || !org) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-xl font-semibold">Organization not found</h1>
        <p className="text-muted-foreground">
          The organization "{orgSlug}" does not exist or you don't have access.
        </p>
      </div>
    );
  }

  // Error handling - project not found
  if (projectError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="text-muted-foreground">
          The project "{projectSlug}" does not exist in this organization.
        </p>
        <button
          onClick={() => navigate({ 
            to: "/$org/$project", 
            params: { org: orgSlug, project: ORG_ADMIN_PROJECT_SLUG } 
          })}
          className="text-primary hover:underline"
        >
          Go to organization home
        </button>
      </div>
    );
  }

  // Build context value
  const contextValue = {
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo ?? null,
    },
    project: {
      id: project.id,
      organizationId: project.organizationId,
      slug: project.slug,
      name: project.name,
      description: project.description,
      enabledPlugins: project.enabledPlugins,
      ui: project.ui,
      isOrgAdmin: project.slug === ORG_ADMIN_PROJECT_SLUG,
    },
    locator: {
      organizationId: org.id,
      projectSlug: project.slug,
    },
  };

  return (
    <ProjectContextProvider value={contextValue}>
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    </ProjectContextProvider>
  );
}
```

### Step 5: Update Components Using Context

Search for components using the old context pattern and update them:

```typescript
// Old pattern (if existed)
const { org } = useOrgContext();

// New pattern
const { org, project } = useProjectContext();
// or
const org = useOrg();
const project = useCurrentProject();
const isOrgAdmin = useIsOrgAdmin();
```

### Step 6: Handle Organization Data Fetching

If there's no existing `useOrganization` hook, create one or adapt the project layout to use existing patterns for org data.

Check how organization data is currently fetched in the shell layout or other components.

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/mesh/src/web/lib/query-keys.ts` | Modify (add project keys) |
| `apps/mesh/src/web/hooks/use-project.ts` | Create |
| `packages/mesh-sdk/src/context/project-context.tsx` | Modify or create |
| `apps/mesh/src/web/layouts/project-layout.tsx` | Modify |
| Components using org/project context | Modify |

## Verification

### 1. Run TypeScript Check

```bash
bun run check
```

All type errors should be resolved.

### 2. Test Context Availability

Start the dev server:
```bash
bun run dev
```

1. Navigate to `/$org/org-admin`
2. Open React DevTools
3. Verify ProjectContext is providing correct data:
   - `org.id`, `org.name`, `org.slug`
   - `project.id`, `project.name`, `project.slug`
   - `project.isOrgAdmin === true`

### 3. Test Non-Existent Project

1. Navigate to `/$org/non-existent-project`
2. Should show "Project not found" error UI
3. "Go to organization home" link should work

### 4. Test Context in Child Components

Add a temporary log in a child component:
```typescript
const { org, project } = useProjectContext();
console.log("Project context:", { org, project });
```

Verify data is available.

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

- [ ] Query keys added for projects
- [ ] `useProject` and `useProjects` hooks created
- [ ] ProjectContext updated with full project data
- [ ] Project layout fetches and provides context
- [ ] Loading state shows splash screen
- [ ] Error states handled gracefully
- [ ] `isOrgAdmin` convenience flag works
- [ ] `bun run check` passes
- [ ] `bun run fmt` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes

## Notes

- Adapt the organization fetching to match existing patterns in the codebase
- The MCP client import path may differ - check existing hooks
- If using a different state management approach, adapt accordingly
- Context may need to be exported from a shared package for plugin access

/**
 * Project Layout
 *
 * Wraps all project-scoped routes. Fetches project data from storage
 * based on URL params and provides enhanced context to child components.
 *
 * The shell-layout above provides basic organization context. This layout
 * enhances it with full project data when available, or handles error states
 * when the project doesn't exist.
 */

import { Outlet, useParams, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { SplashScreen } from "@/web/components/splash-screen";
import { useProject } from "@/web/hooks/use-project";
import {
  ORG_ADMIN_PROJECT_SLUG,
  ProjectContextProvider,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";

/**
 * Error display for when a project is not found
 */
function ProjectNotFoundError({
  projectSlug,
  orgSlug,
}: {
  projectSlug: string;
  orgSlug: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <h1 className="text-xl font-semibold">Project not found</h1>
      <p className="text-muted-foreground text-center">
        The project "{projectSlug}" does not exist in this organization.
      </p>
      <Button
        variant="link"
        onClick={() =>
          navigate({
            to: "/$org/$project",
            params: { org: orgSlug, project: ORG_ADMIN_PROJECT_SLUG },
          })
        }
      >
        Go to organization home
      </Button>
    </div>
  );
}

/**
 * Inner component that fetches project data and provides enhanced context.
 * Must be rendered inside shell-layout's ProjectContextProvider to access org data.
 */
function ProjectLayoutContent() {
  const params = useParams({ strict: false });
  const { org } = useProjectContext();

  const orgSlug = params.org as string;
  const projectSlug = params.project as string;

  // Fetch project data from storage
  const { data: project, isLoading, error } = useProject(org.id, projectSlug);

  // Loading state
  if (isLoading) {
    return <SplashScreen />;
  }

  // Error handling - project not found
  // Note: For org-admin project, we allow it even if not in storage since it may be virtual
  if ((error || !project) && projectSlug !== ORG_ADMIN_PROJECT_SLUG) {
    return <ProjectNotFoundError projectSlug={projectSlug} orgSlug={orgSlug} />;
  }

  // Build enhanced context value with full project data
  const enhancedProject = project
    ? {
        id: project.id,
        organizationId: project.organizationId,
        slug: project.slug,
        name: project.name,
        description: project.description,
        enabledPlugins: project.enabledPlugins,
        ui: project.ui,
        isOrgAdmin: project.slug === ORG_ADMIN_PROJECT_SLUG,
      }
    : {
        // Fallback for org-admin when not stored in DB
        slug: projectSlug,
        name:
          projectSlug === ORG_ADMIN_PROJECT_SLUG
            ? "Organization Admin"
            : projectSlug,
        isOrgAdmin: projectSlug === ORG_ADMIN_PROJECT_SLUG,
      };

  return (
    <ProjectContextProvider org={org} project={enhancedProject}>
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    </ProjectContextProvider>
  );
}

export default function ProjectLayout() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <ProjectLayoutContent />
    </Suspense>
  );
}

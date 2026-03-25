import { ErrorBoundary } from "@/web/components/error-boundary";
import { useProjectSidebarItems } from "@/web/hooks/use-project-sidebar-items";
import { KEYS } from "@/web/lib/query-keys";
import {
  ProjectContextProvider,
  SELF_MCP_ALIAS_ID,
  useIsOrgAdmin,
  useMCPClient,
  useProjectContext,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import { useMatch } from "@tanstack/react-router";
import { Suspense } from "react";
import { NavigationSidebar } from "./navigation";
import { MeshSidebarHeader } from "./header";
import { SidebarInboxFooter } from "./footer/inbox";
import { SidebarProjectsSection } from "./projects-section";

// Export types for external use
export type {
  NavigationSidebarItem,
  SidebarSection,
  SidebarItemGroup,
  Invitation,
} from "./types";

interface MeshSidebarProps {
  virtualMcpId?: string;
}

/**
 * Sidebar content that reads from the current ProjectContext.
 * Renders org-level or project-level sidebar items depending on context.
 */
function SidebarContent({ virtualMcpId }: MeshSidebarProps) {
  const sidebarSections = useProjectSidebarItems({ virtualMcpId });
  const isOrgAdmin = useIsOrgAdmin();

  return (
    <NavigationSidebar
      sections={sidebarSections}
      header={
        <Suspense fallback={<MeshSidebarHeader.Skeleton />}>
          <MeshSidebarHeader />
        </Suspense>
      }
      footer={<SidebarInboxFooter />}
      additionalContent={
        isOrgAdmin ? (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SidebarProjectsSection />
            </Suspense>
          </ErrorBoundary>
        ) : null
      }
    />
  );
}

/**
 * When on a /$org/projects/$virtualMcpId route, wraps the sidebar in a
 * ProjectContextProvider scoped to the virtual MCP so that
 * useProjectSidebarItems() returns project-level items.
 */
function ProjectScopedSidebar({ virtualMcpId }: { virtualMcpId: string }) {
  const { org } = useProjectContext();

  const entity = useVirtualMCP(virtualMcpId);

  // While loading or if entity not found, fall back to org-level sidebar
  if (!entity) {
    return <SidebarContent virtualMcpId={virtualMcpId} />;
  }

  const slug =
    (entity.metadata?.migrated_project_slug as string | undefined) ??
    ((entity.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.slug as string | undefined) ??
    entity.id;

  const projectData = {
    id: entity.id,
    organizationId: org.id,
    slug,
    name: entity.title,
    description: entity.description,
    enabledPlugins: entity.metadata?.enabled_plugins as
      | string[]
      | null
      | undefined,
    ui: entity.metadata?.ui
      ? {
          banner:
            ((entity.metadata.ui as Record<string, unknown>).banner as
              | string
              | null) ?? null,
          bannerColor:
            ((entity.metadata.ui as Record<string, unknown>).bannerColor as
              | string
              | null) ?? null,
          icon:
            ((entity.metadata.ui as Record<string, unknown>).icon as
              | string
              | null) ?? null,
          themeColor:
            ((entity.metadata.ui as Record<string, unknown>).themeColor as
              | string
              | null) ?? null,
          pinnedViews:
            ((entity.metadata.ui as Record<string, unknown>)
              .pinnedViews as Array<{
              connectionId: string;
              toolName: string;
              label: string;
              icon: string | null;
            }> | null) ?? null,
        }
      : null,
    isOrgAdmin: false,
  };

  return (
    <ProjectContextProvider org={org} project={projectData}>
      <SidebarContent virtualMcpId={virtualMcpId} />
    </ProjectContextProvider>
  );
}

/**
 * On org-admin routes, the sidebar renders inside the shell-layout's
 * ProjectContextProvider which has a minimal project stub without
 * enabledPlugins.  We read org settings (sharing the cache with
 * org-layout) and re-provide the project context so that plugin
 * sidebar groups are visible.
 */
function OrgScopedSidebar() {
  const { org, project } = useProjectContext();

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data: orgSettings } = useQuery({
    queryKey: KEYS.organizationSettings(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "ORGANIZATION_SETTINGS_GET",
        arguments: {},
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return (payload ?? {}) as {
        enabled_plugins?: string[] | null;
      };
    },
    staleTime: 60_000,
  });

  const enabledPlugins = orgSettings?.enabled_plugins ?? null;

  return (
    <ProjectContextProvider org={org} project={{ ...project, enabledPlugins }}>
      <SidebarContent />
    </ProjectContextProvider>
  );
}

export function MeshSidebar() {
  const projectMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId",
    shouldThrow: false,
  });
  const virtualMcpId = projectMatch?.params.virtualMcpId;

  if (virtualMcpId) {
    return <ProjectScopedSidebar virtualMcpId={virtualMcpId} />;
  }

  return <OrgScopedSidebar />;
}

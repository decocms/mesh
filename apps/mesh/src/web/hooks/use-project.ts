/**
 * Project Hooks
 *
 * Provides React hooks for fetching project data using MCP tools.
 * Used by ProjectLayout to fetch project information based on URL params.
 */

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMCPClient, SELF_MCP_ALIAS_ID } from "@decocms/mesh-sdk";
import { KEYS } from "../lib/query-keys";

/**
 * Project UI customization
 */
export interface ProjectUI {
  banner: string | null;
  bannerColor: string | null;
  icon: string | null;
  themeColor: string | null;
}

/**
 * Bound connection summary for display
 */
export interface BoundConnectionSummary {
  id: string;
  title: string;
  icon: string | null;
}

/**
 * Serialized project from API
 */
export interface Project {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  enabledPlugins: string[] | null;
  ui: ProjectUI | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project with bound connections (from list endpoint)
 */
export interface ProjectWithBindings extends Omit<Project, "organizationId"> {
  boundConnections: BoundConnectionSummary[];
}

type ProjectGetOutput = { project: Project | null };
type ProjectListOutput = {
  projects: ProjectWithBindings[];
};

/**
 * Hook to fetch a project by organization ID and slug
 *
 * @param organizationId - Organization ID
 * @param slug - Project slug
 * @returns Query result with project data
 */
export function useProject(organizationId: string, slug: string) {
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: organizationId,
  });

  return useQuery({
    queryKey: KEYS.project(organizationId, slug),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "PROJECT_GET",
        arguments: {
          organizationId,
          slug,
        },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as ProjectGetOutput;
      return payload.project;
    },
    enabled: !!organizationId && !!slug,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch all projects in an organization
 *
 * @param organizationId - Organization ID
 * @param options - Optional configuration
 * @param options.suspense - If true, uses useSuspenseQuery instead of useQuery
 * @returns Query result with projects array
 */
export function useProjects(
  organizationId: string,
  options?: { suspense?: boolean },
) {
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: organizationId,
  });

  const queryConfig = {
    queryKey: KEYS.projects(organizationId),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "PROJECT_LIST",
        arguments: {
          organizationId,
        },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ?? result) as ProjectListOutput;
      // Add organizationId back to each project for completeness
      return payload.projects.map((p) => ({
        ...p,
        organizationId,
      })) as (ProjectWithBindings & { organizationId: string })[];
    },
    staleTime: 30000, // 30 seconds
  };

  if (options?.suspense) {
    return useSuspenseQuery(queryConfig);
  }

  return useQuery({
    ...queryConfig,
    enabled: !!organizationId,
  });
}

/**
 * ProjectScope — Context that provides the current project's agent IDs.
 * Used to scope the agent selector to only show agents in this project.
 */

import { createContext, use, type ReactNode } from "react";

interface ProjectScopeValue {
  /** Set of Virtual MCP IDs that are agents in the current project */
  agentIds: Set<string>;
}

const ProjectScopeContext = createContext<ProjectScopeValue | null>(null);

export function ProjectScopeProvider({
  agentIds,
  children,
}: {
  agentIds: Set<string>;
  children: ReactNode;
}) {
  return (
    <ProjectScopeContext value={{ agentIds }}>{children}</ProjectScopeContext>
  );
}

/** Returns the project's agent IDs if inside a project, null otherwise */
export function useProjectScope(): ProjectScopeValue | null {
  return use(ProjectScopeContext);
}

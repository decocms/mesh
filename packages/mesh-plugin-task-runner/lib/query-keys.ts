/**
 * Query Keys for Task Runner
 *
 * Centralized query key definitions for React Query.
 */

export const KEYS = {
  workspace: ["task-runner", "workspace"] as const,
  beadsStatus: ["task-runner", "beads-status"] as const,
  loopStatusLegacy: ["task-runner", "loop-status"] as const,
  tasks: (connectionId: string) =>
    ["task-runner", "tasks", connectionId] as const,
  readyTasks: (connectionId: string) =>
    ["task-runner", "ready", connectionId] as const,
  loopStatus: (connectionId: string) =>
    ["task-runner", "loop", connectionId] as const,
  skills: (connectionId: string) =>
    ["task-runner", "skills", connectionId] as const,
  agentSessions: (connectionId: string) =>
    ["task-runner", "agent-sessions", connectionId] as const,
  agentSessionsBase: ["task-runner", "agent-sessions"] as const,
  qualityGates: (connectionId: string) =>
    ["task-runner", "quality-gates", connectionId] as const,
  projectMemory: (connectionId: string) =>
    ["task-runner", "project-memory", connectionId] as const,
};

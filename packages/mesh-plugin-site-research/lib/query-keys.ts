/**
 * React Query keys for Site Research plugin
 */

export const KEYS = {
  sessions: (connectionId: string) =>
    ["site-research", "sessions", connectionId] as const,
  sessionMeta: (connectionId: string, sessionId: string) =>
    ["site-research", "meta", connectionId, sessionId] as const,
  sessionProgress: (connectionId: string, sessionId: string) =>
    ["site-research", "progress", connectionId, sessionId] as const,
  report: (connectionId: string, sessionId: string) =>
    ["site-research", "report", connectionId, sessionId] as const,
  pluginConfig: (projectId: string, pluginId: string) =>
    ["project-plugin-config", projectId, pluginId] as const,
} as const;

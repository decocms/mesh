/**
 * React Query keys for Reports plugin
 */

export const KEYS = {
  reportsList: (connectionId: string, category?: string, status?: string) =>
    ["reports", "list", connectionId, { category, status }] as const,
  report: (connectionId: string, reportId: string) =>
    ["reports", "detail", connectionId, reportId] as const,
  pluginConfig: (projectId: string, pluginId: string) =>
    ["project-plugin-config", projectId, pluginId] as const,
} as const;

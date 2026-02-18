export const KEYS = {
  all: ["private-registry"] as const,
  items: () => [...KEYS.all, "items"] as const,
  itemsList: (
    search: string,
    tags: string[],
    categories: string[],
    limit?: number,
  ) => [...KEYS.items(), "list", { search, tags, categories, limit }] as const,
  item: (id: string) => [...KEYS.items(), "item", id] as const,
  filters: () => [...KEYS.all, "filters"] as const,
  registryConfig: () => [...KEYS.all, "registry-config"] as const,
  registryConfigByPlugin: (projectId: string, pluginId: string) =>
    [...KEYS.registryConfig(), projectId, pluginId] as const,
  publishRequests: () => [...KEYS.all, "publish-requests"] as const,
  publishRequestsList: (status?: string) =>
    [...KEYS.publishRequests(), "list", { status: status ?? "all" }] as const,
  publishRequestsCount: () => [...KEYS.publishRequests(), "count"] as const,
  publishApiKeys: () => [...KEYS.all, "publish-api-keys"] as const,
  tests: () => [...KEYS.all, "tests"] as const,
  testRuns: () => [...KEYS.tests(), "runs"] as const,
  testRunsList: (status?: string) =>
    [...KEYS.testRuns(), "list", { status: status ?? "all" }] as const,
  testRun: (runId?: string) =>
    [...KEYS.testRuns(), "run", runId ?? "none"] as const,
  testResults: () => [...KEYS.tests(), "results"] as const,
  testResultsList: (runId?: string, status?: string) =>
    [
      ...KEYS.testResults(),
      "list",
      { runId: runId ?? "none", status: status ?? "all" },
    ] as const,
  testConnections: () => [...KEYS.tests(), "connections"] as const,
};

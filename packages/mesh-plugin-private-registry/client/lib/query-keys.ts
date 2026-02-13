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
};

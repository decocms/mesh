export const KEYS = {
  all: ["private-registry"] as const,
  items: () => [...KEYS.all, "items"] as const,
  itemsList: (search: string, tags: string[], categories: string[]) =>
    [...KEYS.items(), "list", { search, tags, categories }] as const,
  item: (id: string) => [...KEYS.items(), "item", id] as const,
  filters: () => [...KEYS.all, "filters"] as const,
  registryConfig: () => [...KEYS.all, "registry-config"] as const,
  registryConfigByPlugin: (projectId: string, pluginId: string) =>
    [...KEYS.registryConfig(), projectId, pluginId] as const,
};

/**
 * React Query keys for Object Storage plugin
 */

export const KEYS = {
  objects: (connectionId: string, prefix: string) =>
    ["object-storage", "objects", connectionId, prefix] as const,
  metadata: (connectionId: string, key: string) =>
    ["object-storage", "metadata", connectionId, key] as const,
} as const;

/**
 * Hook for fetching and managing objects in storage
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { KEYS } from "../lib/query-keys";
import type { ListObjectsOutput } from "@decocms/bindings";

const PAGE_SIZE = 100;

interface UseObjectsOptions {
  prefix?: string;
}

interface ObjectItem {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  isFolder: boolean;
}

interface UseObjectsResult {
  objects: ObjectItem[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: Error | null;
}

/**
 * Extract folder prefixes from object keys
 * S3 returns objects with their full paths, we need to extract folder names
 */
function extractFoldersAndFiles(
  items: ListObjectsOutput["objects"],
  currentPrefix: string,
): ObjectItem[] {
  const result: ObjectItem[] = [];
  const seenFolders = new Set<string>();

  for (const item of items) {
    // Remove the current prefix to get relative path
    const relativePath = item.key.slice(currentPrefix.length);

    // Check if this is a nested path (contains more /)
    const slashIndex = relativePath.indexOf("/");

    if (slashIndex > 0) {
      // This is inside a folder
      const folderName = relativePath.slice(0, slashIndex + 1);
      const folderPath = currentPrefix + folderName;

      if (!seenFolders.has(folderPath)) {
        seenFolders.add(folderPath);
        result.push({
          key: folderPath,
          size: 0,
          lastModified: item.lastModified,
          etag: "",
          isFolder: true,
        });
      }
    } else if (relativePath && !relativePath.endsWith("/")) {
      // This is a file at the current level
      result.push({
        key: item.key,
        size: item.size,
        lastModified: item.lastModified,
        etag: item.etag,
        isFolder: false,
      });
    }
  }

  // Sort: folders first, then alphabetically
  return result.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.key.localeCompare(b.key);
  });
}

export function useObjects(options: UseObjectsOptions = {}): UseObjectsResult {
  const { prefix = "" } = options;
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: KEYS.objects(connectionId, prefix),
    queryFn: async ({ pageParam }): Promise<ListObjectsOutput> => {
      const result = await toolCaller("LIST_OBJECTS", {
        prefix: prefix || undefined,
        maxKeys: PAGE_SIZE,
        continuationToken: pageParam,
      });
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextContinuationToken,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Flatten all pages and extract folders/files
  const allItems = data?.pages.flatMap((page) => page.objects) ?? [];
  const objects = extractFoldersAndFiles(allItems, prefix);

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return {
    objects,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    loadMore,
    error: error as Error | null,
  };
}

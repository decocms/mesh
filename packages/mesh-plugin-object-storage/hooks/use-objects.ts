/**
 * Hook for fetching and managing objects in storage
 *
 * Supports two view modes:
 * - Directory mode (flat=false): Uses S3's delimiter to show folders and files hierarchically
 * - Flat mode (flat=true): Shows all objects as a flat list without folder abstraction
 *
 * Items are returned in S3's natural order (lexicographical by key) to maintain
 * stable infinite scroll. Client-side sorting is not used to avoid items shifting
 * when new pages load.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { KEYS } from "../lib/query-keys";
import type { ListObjectsOutput } from "@decocms/bindings";

const DEFAULT_PAGE_SIZE = 100;

export interface UseObjectsOptions {
  prefix?: string;
  flat?: boolean;
  pageSize?: number;
}

export interface ObjectItem {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  isFolder: boolean;
}

export interface UseObjectsResult {
  objects: ObjectItem[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: Error | null;
}

export function useObjects(options: UseObjectsOptions = {}): UseObjectsResult {
  const { prefix = "", flat = false, pageSize = DEFAULT_PAGE_SIZE } = options;
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
    queryKey: KEYS.objects(connectionId, prefix, flat, pageSize),
    queryFn: async ({ pageParam }): Promise<ListObjectsOutput> => {
      const result = await toolCaller("LIST_OBJECTS", {
        prefix: prefix || undefined,
        maxKeys: pageSize,
        continuationToken: pageParam,
        // Only use delimiter in directory mode to get folders via commonPrefixes
        delimiter: flat ? undefined : "/",
      });
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextContinuationToken,
    staleTime: 30 * 1000, // 30 seconds
  });

  let objects: ObjectItem[];

  if (flat) {
    // Flat mode: All objects as files, no folder abstraction
    // Don't re-sort across pages to maintain stable infinite scroll
    // Items appear in S3's natural order (lexicographical by key)
    objects =
      data?.pages
        .flatMap((page) => page.objects)
        .filter((obj) => !obj.key.endsWith("/")) // Exclude folder markers
        .map((obj) => ({
          key: obj.key,
          size: obj.size,
          lastModified: obj.lastModified,
          etag: obj.etag,
          isFolder: false,
        })) ?? [];
  } else {
    // Directory mode: Folders from commonPrefixes, files from objects
    // Folders come first (from first page only), files follow in page order
    const folders: ObjectItem[] =
      data?.pages[0]?.commonPrefixes?.map((folderPath) => ({
        key: folderPath,
        size: 0,
        lastModified: "",
        etag: "",
        isFolder: true,
      })) ?? [];

    const files: ObjectItem[] =
      data?.pages.flatMap((page) =>
        page.objects
          .filter((obj) => !obj.key.endsWith("/")) // Exclude folder markers
          .map((obj) => ({
            key: obj.key,
            size: obj.size,
            lastModified: obj.lastModified,
            etag: obj.etag,
            isFolder: false,
          })),
      ) ?? [];

    // Sort folders alphabetically, files maintain page order for stable infinite scroll
    const sortedFolders = folders.sort((a, b) => a.key.localeCompare(b.key));
    objects = [...sortedFolders, ...files];
  }

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

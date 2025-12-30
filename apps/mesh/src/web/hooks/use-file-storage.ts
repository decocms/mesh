/**
 * File Storage Hooks
 *
 * Hooks for interacting with file storage connections.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnections } from "./collections/use-connection";
import { useBindingConnections } from "./use-binding";
import type { ConnectionEntity } from "@/tools/connection/schema";
import type { FileEntity } from "@decocms/bindings/file-storage";
import { createToolCaller } from "@/tools/client";
import { KEYS } from "@/web/lib/query-keys";

/**
 * Query keys for file storage
 */
export const fileStorageKeys = {
  all: ["file-storage"] as const,
  connections: () => [...fileStorageKeys.all, "connections"] as const,
  files: (connectionId: string, path: string) =>
    [...fileStorageKeys.all, "files", connectionId, path] as const,
  file: (connectionId: string, path: string) =>
    [...fileStorageKeys.all, "file", connectionId, path] as const,
};

/**
 * Hook to get connections that implement FILE_STORAGE_BINDING
 *
 * @returns Array of connections that can store files
 */
export function useFileStorageConnections(): ConnectionEntity[] {
  // useConnections returns items directly (an array)
  const connections = useConnections();

  return useBindingConnections({
    connections,
    binding: "FILE_STORAGE",
  });
}

/**
 * Hook to check if file storage is available
 *
 * @returns true if at least one file storage connection is available
 */
export function useHasFileStorage(): boolean {
  const storageConnections = useFileStorageConnections();
  return storageConnections.length > 0;
}

/**
 * Hook to get the primary file storage connection
 * Returns the first available storage connection
 *
 * @returns The primary storage connection or undefined
 */
export function usePrimaryFileStorage(): ConnectionEntity | undefined {
  const storageConnections = useFileStorageConnections();
  return storageConnections[0];
}

/**
 * Hook to list files in a folder
 *
 * @param connectionId - Connection ID of the storage provider
 * @param parentPath - Parent folder path (empty string for root)
 * @returns Query result with files
 */
export function useFileList(connectionId: string, parentPath = "") {
  const toolCaller = createToolCaller(connectionId);

  return useQuery({
    queryKey: fileStorageKeys.files(connectionId, parentPath),
    queryFn: async () => {
      const result = await toolCaller("COLLECTION_FILES_LIST", {
        where: parentPath
          ? { field: ["parent"], operator: "eq", value: parentPath }
          : undefined,
      });
      return result as { items: FileEntity[]; totalCount?: number };
    },
    enabled: !!connectionId,
  });
}

/**
 * Hook to read a file's content
 *
 * @param connectionId - Connection ID of the storage provider
 * @param path - File path to read
 * @param encoding - Encoding (default: utf-8)
 * @param enabled - Whether the query should run (default: true)
 * @returns Query result with file content
 */
export function useFileContent(
  connectionId: string,
  path: string,
  encoding: "utf-8" | "base64" = "utf-8",
  enabled = true,
) {
  const toolCaller = createToolCaller(connectionId);

  return useQuery({
    queryKey: fileStorageKeys.file(connectionId, path),
    queryFn: async () => {
      const result = await toolCaller("FILE_READ", { path, encoding });
      return result as { content: string; metadata: FileEntity };
    },
    enabled: enabled && !!connectionId && !!path,
  });
}

/**
 * Convert File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Hook to upload files
 *
 * @param connectionId - Connection ID of the storage provider
 * @returns Mutation for uploading files
 */
export function useFileUpload(connectionId: string) {
  const queryClient = useQueryClient();
  const toolCaller = createToolCaller(connectionId);

  return useMutation({
    mutationFn: async ({ file, path }: { file: File; path?: string }) => {
      const content = await fileToBase64(file);
      const targetPath = path || file.name;

      const result = await toolCaller("FILE_WRITE", {
        path: targetPath,
        content,
        encoding: "base64",
        mimeType: file.type,
        createParents: true,
        overwrite: true,
      });

      return result as { file: FileEntity };
    },
    onSuccess: () => {
      // Invalidate file lists to refresh
      queryClient.invalidateQueries({
        queryKey: fileStorageKeys.all,
      });
      // Also invalidate the collection list queries for FILES and FOLDERS
      queryClient.invalidateQueries({
        queryKey: KEYS.collectionListPrefix(connectionId, "FILES"),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.collectionListPrefix(connectionId, "FOLDERS"),
      });
    },
  });
}

/**
 * Helper to invalidate all file-related queries
 */
function invalidateFileQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  connectionId: string,
) {
  // Invalidate file storage queries
  queryClient.invalidateQueries({
    queryKey: fileStorageKeys.all,
  });
  // Invalidate collection list queries for FILES and FOLDERS
  queryClient.invalidateQueries({
    queryKey: KEYS.collectionListPrefix(connectionId, "FILES"),
  });
  queryClient.invalidateQueries({
    queryKey: KEYS.collectionListPrefix(connectionId, "FOLDERS"),
  });
}

/**
 * Hook for file mutations (write, delete, move, etc.)
 *
 * @param connectionId - Connection ID of the storage provider
 * @returns Object with mutation functions
 */
export function useFileMutations(connectionId: string) {
  const queryClient = useQueryClient();
  const toolCaller = createToolCaller(connectionId);

  const writeMutation = useMutation({
    mutationFn: async ({
      path,
      content,
      encoding = "utf-8",
    }: {
      path: string;
      content: string;
      encoding?: "utf-8" | "base64";
    }) => {
      const result = await toolCaller("FILE_WRITE", {
        path,
        content,
        encoding,
        createParents: true,
        overwrite: true,
      });
      return result as { file: FileEntity };
    },
    onSuccess: () => {
      invalidateFileQueries(queryClient, connectionId);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      path,
      recursive = false,
    }: {
      path: string;
      recursive?: boolean;
    }) => {
      const result = await toolCaller("FILE_DELETE", { path, recursive });
      return result as { success: boolean; path: string };
    },
    onSuccess: () => {
      invalidateFileQueries(queryClient, connectionId);
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({
      from,
      to,
      overwrite = false,
    }: {
      from: string;
      to: string;
      overwrite?: boolean;
    }) => {
      const result = await toolCaller("FILE_MOVE", { from, to, overwrite });
      return result as { file: FileEntity };
    },
    onSuccess: () => {
      invalidateFileQueries(queryClient, connectionId);
    },
  });

  const mkdirMutation = useMutation({
    mutationFn: async ({
      path,
      recursive = true,
    }: {
      path: string;
      recursive?: boolean;
    }) => {
      const result = await toolCaller("FILE_MKDIR", { path, recursive });
      return result as { folder: FileEntity };
    },
    onSuccess: () => {
      invalidateFileQueries(queryClient, connectionId);
    },
  });

  return {
    write: writeMutation,
    save: writeMutation, // Alias for save
    delete: deleteMutation,
    move: moveMutation,
    mkdir: mkdirMutation,
    isSaving: writeMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isMoving: moveMutation.isPending,
  };
}

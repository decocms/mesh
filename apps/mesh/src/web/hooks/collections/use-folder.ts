/**
 * Folder Collection Hooks
 *
 * Provides React hooks for working with folders using React Query.
 */

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createToolCaller } from "../../../tools/client";
import type { FolderEntity, FolderType } from "../../../tools/folder/schema";
import { useProjectContext } from "../../providers/project-context-provider";
import { KEYS } from "../../lib/query-keys";

/**
 * Hook to get folders of a specific type
 *
 * @param type - The type of folders to fetch ("connections" or "gateways")
 * @returns Suspense query result with folders
 */
export function useFolders(type: FolderType) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();

  return useSuspenseQuery<FolderEntity[]>({
    queryKey: KEYS.folders(org.slug, type),
    queryFn: async () => {
      const result = await toolCaller("FOLDER_LIST", { type });
      return (result as { items: FolderEntity[] }).items;
    },
    staleTime: 60_000,
  });
}

/**
 * Hook to get folder mutation actions (create, update, delete)
 *
 * @param type - The type of folders to manage ("connections" or "gateways")
 * @returns Object with create, update, and delete mutation hooks
 */
export function useFolderActions(type: FolderType) {
  const { org } = useProjectContext();
  const toolCaller = createToolCaller();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.folders(org.slug, type) });
    // Also invalidate connections and gateways since they might have folder_id changes
    queryClient.invalidateQueries({
      queryKey: KEYS.collection(org.slug, "CONNECTIONS"),
    });
    queryClient.invalidateQueries({
      queryKey: KEYS.collection(org.slug, "GATEWAYS"),
    });
  };

  const create = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string | null;
      icon?: string | null;
      color?: string | null;
      sort_order?: number;
    }) => {
      const result = await toolCaller("FOLDER_CREATE", {
        data: { ...data, type },
      });
      return (result as { item: FolderEntity }).item;
    },
    onSuccess: (folder) => {
      toast.success(`Created folder "${folder.title}"`);
      invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to create folder: ${error.message}`);
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        title?: string;
        description?: string | null;
        icon?: string | null;
        color?: string | null;
        sort_order?: number;
      };
    }) => {
      const result = await toolCaller("FOLDER_UPDATE", { id, data });
      return (result as { item: FolderEntity }).item;
    },
    onSuccess: (folder) => {
      toast.success(`Updated folder "${folder.title}"`);
      invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update folder: ${error.message}`);
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      await toolCaller("FOLDER_DELETE", { id });
    },
    onSuccess: () => {
      toast.success("Folder deleted");
      invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete folder: ${error.message}`);
    },
  });

  return {
    create,
    update,
    delete: deleteFolder,
  };
}

/**
 * Re-export types for convenience
 */
export type { FolderEntity, FolderType };

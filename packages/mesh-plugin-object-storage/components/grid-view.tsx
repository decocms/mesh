/**
 * Grid View Component
 *
 * Displays files as a grid of squares with mimetype icons or image previews.
 * Supports infinite scroll loading with stable ordering (no re-sorting on new pages).
 * Image files show lazy-loaded previews using presigned URLs.
 */

import { usePluginContext } from "@decocms/bindings";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { useObjects, type ObjectItem } from "../hooks/use-objects";
import { getFileName, getFileIcon, formatFileSize } from "../lib/utils";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Folder,
  File02,
  File04,
  File06,
  File07,
  FileCode01,
  Image01,
  VideoRecorder,
  Upload01,
  Download01,
  Trash01,
  Loading01,
  AlertCircle,
  FolderPlus,
} from "@untitledui/icons";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { KEYS } from "../lib/query-keys";
import { ImagePreview } from "./image-preview";

const GRID_PAGE_SIZE = 12;

// Map icon names to components
const iconMap: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  Image01,
  VideoRecorder,
  Music01: File02, // Fallback for audio files
  File02,
  File04,
  File06,
  File07,
  FileCode01,
  Folder,
};

/**
 * Check if a file is an image based on its extension
 */
function isImageFile(key: string): boolean {
  const ext = key.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(
    ext || "",
  );
}

interface GridItemProps {
  item: ObjectItem;
  onNavigate: (path: string) => void;
  onDownload: (key: string) => void;
  onDelete: (key: string) => void;
}

function GridItem({ item, onNavigate, onDownload, onDelete }: GridItemProps) {
  const name = getFileName(item.key);
  const iconName = item.isFolder ? "Folder" : getFileIcon(item.key);
  const IconComponent = iconMap[iconName] || File02;
  const isImage = !item.isFolder && isImageFile(item.key);

  return (
    <div className="group relative aspect-square bg-muted/30 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors overflow-hidden">
      {/* Main clickable area */}
      <button
        type="button"
        onClick={() => (item.isFolder ? onNavigate(item.key) : undefined)}
        className={`flex flex-col items-center justify-center w-full h-full ${
          isImage ? "" : "p-4"
        } ${item.isFolder ? "cursor-pointer" : "cursor-default"}`}
      >
        {/* Image preview or icon */}
        {isImage ? (
          <div className="absolute inset-0">
            <ImagePreview objectKey={item.key} alt={name} />
          </div>
        ) : (
          <IconComponent
            size={48}
            className={
              item.isFolder ? "text-amber-500" : "text-muted-foreground"
            }
          />
        )}

        {/* File name - shown below for non-images, as overlay for images */}
        {isImage ? (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
            <span className="text-sm text-white text-center line-clamp-1 block">
              {name}
            </span>
            <span className="text-xs text-white/70 text-center block">
              {formatFileSize(item.size)}
            </span>
          </div>
        ) : (
          <>
            <span className="mt-3 text-sm text-center line-clamp-2 px-2">
              {name}
            </span>
            {!item.isFolder && (
              <span className="mt-1 text-xs text-muted-foreground">
                {formatFileSize(item.size)}
              </span>
            )}
          </>
        )}
      </button>

      {/* Action buttons (hover) */}
      {!item.isFolder && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="sm"
            className="size-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(item.key);
            }}
          >
            <Download01 size={14} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="size-7 p-0 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.key);
            }}
          >
            <Trash01 size={14} />
          </Button>
        </div>
      )}

      {/* Delete button for folders */}
      {item.isFolder && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="sm"
            className="size-7 p-0 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.key);
            }}
          >
            <Trash01 size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

interface GridViewProps {
  prefix: string;
  flat: boolean;
  onNavigate: (path: string) => void;
}

export default function GridView({ prefix, flat, onNavigate }: GridViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  // Grid view: smaller page size for better lazy loading of images
  const { objects, isLoading, isFetchingMore, hasMore, loadMore, error } =
    useObjects({
      prefix,
      flat,
      pageSize: GRID_PAGE_SIZE,
    });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const key = prefix + file.name;

      const { url } = await toolCaller("PUT_PRESIGNED_URL", {
        key,
        contentType: file.type || "application/octet-stream",
      });

      const response = await fetch(url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return key;
    },
    onSuccess: (key) => {
      toast.success(`Uploaded ${getFileName(key)}`);
      queryClient.invalidateQueries({
        queryKey: KEYS.objects(connectionId, prefix, flat, GRID_PAGE_SIZE),
      });
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      if (keys.length === 1 && keys[0]) {
        return toolCaller("DELETE_OBJECT", { key: keys[0] });
      }
      return toolCaller("DELETE_OBJECTS", { keys });
    },
    onSuccess: () => {
      toast.success("Deleted successfully");
      queryClient.invalidateQueries({
        queryKey: KEYS.objects(connectionId, prefix, flat, GRID_PAGE_SIZE),
      });
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`);
    },
  });

  // Download handler
  const handleDownload = async (key: string) => {
    try {
      const { url } = await toolCaller("GET_PRESIGNED_URL", { key });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = getFileName(key);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(
        `Download failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // File input change handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      uploadMutation.mutate(file);
    }

    e.target.value = "";
  };

  // Scroll handler for infinite loading
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || isFetchingMore) return;

    const target = e.currentTarget;
    const scrollBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    if (scrollBottom < 200) {
      loadMore();
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading files</h3>
        <p className="text-muted-foreground text-center">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4" onScroll={handleScroll}>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loading01
            size={32}
            className="animate-spin text-muted-foreground mb-4"
          />
          <p className="text-sm text-muted-foreground">Loading files...</p>
        </div>
      ) : objects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderPlus size={48} className="text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">This folder is empty</h3>
          <p className="text-muted-foreground mb-4">
            Upload files to get started
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload01 size={14} className="mr-1" />
            Upload files
          </Button>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {objects.map((item) => (
              <GridItem
                key={item.key}
                item={item}
                onNavigate={onNavigate}
                onDownload={handleDownload}
                onDelete={(key) => deleteMutation.mutate([key])}
              />
            ))}
          </div>

          {/* Loading more indicator */}
          {isFetchingMore && (
            <div className="flex justify-center py-8">
              <Loading01
                size={24}
                className="animate-spin text-muted-foreground"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

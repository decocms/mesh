/**
 * FileDropZone Component
 *
 * A global drop zone overlay that appears when files are dragged over the app.
 * Only active when at least one MCP implements FILE_STORAGE_BINDING.
 */

import { useState, type ReactNode } from "react";
import { Upload01 } from "@untitledui/icons";
import { toast } from "sonner";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  useFileStorageConnections,
  useFileUpload,
} from "@/web/hooks/use-file-storage";

interface FileDropZoneProps {
  children: ReactNode;
  className?: string;
}

/**
 * Global file drop zone that wraps the app content.
 * Shows a drop overlay when files are dragged and a storage provider is available.
 */
export function FileDropZone({ children, className }: FileDropZoneProps) {
  const storageConnections = useFileStorageConnections();
  const hasStorage = storageConnections.length > 0;
  const primaryStorage = storageConnections[0];

  const [isDragOver, setIsDragOver] = useState(false);
  // Track enter/leave count to handle nested elements
  const [, setDragCounter] = useState(0);

  const uploadMutation = useFileUpload(primaryStorage?.id ?? "");

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragOver(false);
      }
      return newCount;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragCounter(0);

    if (!hasStorage) {
      toast.error("No file storage configured");
      return;
    }

    const files = Array.from(e.dataTransfer?.files ?? []);

    if (files.length === 0) {
      return;
    }

    // Upload each file
    for (const file of files) {
      try {
        await uploadMutation.mutateAsync({ file });
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };

  // Don't render drag overlay if no storage is available
  if (!hasStorage) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn("relative h-full", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Upload01 className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Drop files to upload</h3>
              <p className="text-sm text-muted-foreground">
                Files will be stored in{" "}
                {primaryStorage?.title ?? "local storage"}
              </p>
            </div>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * Hook to manually trigger file upload
 * Useful for buttons or programmatic uploads
 */
export function useFileDropUpload() {
  const storageConnections = useFileStorageConnections();
  const primaryStorage = storageConnections[0];
  const uploadMutation = useFileUpload(primaryStorage?.id ?? "");

  const uploadFiles = async (files: File[]) => {
    if (!primaryStorage) {
      throw new Error("No file storage configured");
    }

    const results = [];
    for (const file of files) {
      const result = await uploadMutation.mutateAsync({ file });
      results.push(result);
    }
    return results;
  };

  return {
    uploadFiles,
    isUploading: uploadMutation.isPending,
    hasStorage: !!primaryStorage,
    storageConnection: primaryStorage,
  };
}

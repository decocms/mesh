/**
 * FileBrowser Component
 *
 * A file browser component for navigating folders and files.
 */

import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import { ArrowLeft, Folder, Loading01 } from "@untitledui/icons";
import { useFileList } from "@/web/hooks/use-file-storage";
import type { FileEntity } from "@decocms/bindings/file-storage";
import { cn } from "@deco/ui/lib/utils.ts";
import { FileIconInline } from "./file-icon";

interface FileBrowserProps {
  connectionId: string;
  initialPath?: string;
  onFileSelect?: (file: FileEntity) => void;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * File browser for navigating files and folders
 */
export function FileBrowser({
  connectionId,
  initialPath = "",
  onFileSelect,
}: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const { data, isLoading, error } = useFileList(connectionId, currentPath);

  const files = data?.items ?? [];

  // Navigate to parent folder
  const navigateUp = () => {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  // Handle item click
  const handleItemClick = (file: FileEntity) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
    } else if (onFileSelect) {
      onFileSelect(file);
    }
  };

  // Build breadcrumb parts
  const breadcrumbParts = currentPath.split("/").filter(Boolean);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Loading01 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <EmptyState
          title="Error loading files"
          description={error instanceof Error ? error.message : "Unknown error"}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb / navigation */}
      <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!currentPath}
          onClick={navigateUp}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setCurrentPath("")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            /
          </button>
          {breadcrumbParts.map((part, index) => (
            <span key={part} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPath(breadcrumbParts.slice(0, index + 1).join("/"))
                }
                className={cn(
                  "hover:text-foreground transition-colors",
                  index === breadcrumbParts.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {part}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
            <Folder className="h-12 w-12 mb-4 opacity-30" />
            <span className="text-sm">Empty folder</span>
            <p className="text-xs text-muted-foreground mt-1">
              Drop files here to upload
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => handleItemClick(file)}
              >
                <FileIconInline
                  path={file.path}
                  mimeType={file.mimeType}
                  isDirectory={file.isDirectory}
                />

                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-sm">
                    {file.title}
                  </div>
                  {!file.isDirectory && (
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </div>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  {new Date(file.updated_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

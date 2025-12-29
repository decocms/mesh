/**
 * File/Folder Details View
 *
 * Custom view components for files and folders collections.
 */

import { useParams } from "@tanstack/react-router";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Download01,
  Trash01,
  File06,
  Folder,
  Loading01,
} from "@untitledui/icons";
import { FileBrowser } from "@/web/components/files/file-browser";
import { FilePreview } from "@/web/components/files/file-preview";
import { useFileContent, useFileMutations } from "@/web/hooks/use-file-storage";
import { ViewLayout, ViewActions, ViewTabs } from "../layout";
import { toast } from "sonner";
import type { FileEntity } from "@decocms/bindings/file-storage";

interface FileDetailsProps {
  itemId: string;
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

/**
 * File Details View
 *
 * Shows file preview and allows basic operations.
 * For text files, could integrate Monaco editor in the future.
 */
export function FileDetailsView({ itemId, onBack }: FileDetailsProps) {
  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const path = decodeURIComponent(itemId);
  const { data, isLoading } = useFileContent(connectionId, path);
  const { delete: deleteMutation } = useFileMutations(connectionId);

  const file = data?.metadata;

  const handleDelete = async () => {
    if (!file) return;

    if (!confirm(`Delete ${file.title}?`)) return;

    try {
      await deleteMutation.mutateAsync({ path: file.path });
      toast.success(`Deleted ${file.title}`);
      onBack();
    } catch (error) {
      toast.error("Failed to delete file");
    }
  };

  const handleDownload = () => {
    if (file?.url) {
      window.open(file.url, "_blank");
    }
  };

  if (isLoading || !file) {
    return (
      <ViewLayout onBack={onBack}>
        <div className="flex items-center justify-center h-full">
          <Loading01 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout onBack={onBack}>
      <ViewTabs>
        <div className="flex items-center gap-2">
          <File06 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{file.title}</span>
          <span className="text-xs text-muted-foreground">({file.path})</span>
        </div>
      </ViewTabs>

      <ViewActions>
        {file.url && (
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download01 className="h-4 w-4 mr-2" />
            Download
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          <Trash01 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </ViewActions>

      <div className="h-full overflow-hidden">
        <FilePreview
          connectionId={connectionId}
          file={file}
          className="h-full"
        />
      </div>
    </ViewLayout>
  );
}

/**
 * Folder Details View
 *
 * Shows folder contents with file browser.
 */
export function FolderDetailsView({ itemId, onBack }: FileDetailsProps) {
  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const path = decodeURIComponent(itemId);
  const folderName = path.split("/").pop() || "Root";

  const handleFileSelect = (file: FileEntity) => {
    // Navigate to file detail view
    // For now, just show a toast
    if (!file.isDirectory) {
      toast.info(`Selected: ${file.title}`);
    }
  };

  return (
    <ViewLayout onBack={onBack}>
      <ViewTabs>
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-amber-500" />
          <span className="font-medium">{folderName}</span>
          <span className="text-xs text-muted-foreground">(/{path})</span>
        </div>
      </ViewTabs>

      <div className="h-full overflow-hidden">
        <FileBrowser
          connectionId={connectionId}
          initialPath={path}
          onFileSelect={handleFileSelect}
        />
      </div>
    </ViewLayout>
  );
}
